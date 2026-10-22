import fs from "node:fs";
import path from "node:path";
import { HSTS_PRELOAD } from "../datasets.ts";
import {
  guardedGet,
  MEASUREMENT_LIMITS,
  pacer,
  userAgent,
  type Pacer,
  type RequestLogEntry,
} from "../ethics.ts";
import {
  countMixedContent,
  HeaderBag,
  parseCookies,
  parseCsp,
  parseFraming,
  parseHsts,
  parseOtherHeaders,
  parseSecurityTxt,
} from "../measure/headers.ts";
import { measureTls } from "../measure/tls.ts";
import { readRows } from "../utils/csv.ts";
import { readJson, writeJson } from "../utils/files.ts";
import { num, today } from "../utils/format.ts";
import { round } from "../utils/round.ts";
import { OUT, rel } from "../utils/paths.ts";
import { parseRobots } from "../utils/robots.ts";
import { matchesExpected } from "../verify.ts";
import { OUTPUT as SAMPLE_FRAME } from "./03h-finalize.ts";

export const OUTPUT = path.join(OUT, "measurements.jsonl");
export const REQUEST_LOG = path.join(OUT, "measurement_request_log.jsonl");
const PROVENANCE = path.join(OUT, "_provenance_04_measurement.json");

const BOT_WALL_STATUSES = new Set([401, 403, 406, 451]);
const SECURITY_TXT_PATH = "/.well-known/security.txt";
const SECURITY_TXT_LIMIT = 4000;
const PROGRESS_EVERY = 50;

type Site = {
  site_id: string;
  domain: string;
  stratum: string;
  sector: string;
  crux_best_bucket: string;
  bot_blocked: string;
};

export async function measureSites(limit?: number): Promise<void> {
  userAgent();
  await assertFrameUnchanged();

  const preload = readPreloadList();
  const all = await pendingSites();
  const sites = limit ? all.slice(0, limit) : all;
  if (sites.length === 0) {
    console.log("  the measurement is already complete, nothing to do");
    return;
  }

  console.log(`  ${num(sites.length)} sites to measure, concurrency ${MEASUREMENT_LIMITS.concurrency}`);

  const results = openJsonl(OUTPUT);
  const requests = openJsonl(REQUEST_LOG);
  const started = Date.now();
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < sites.length) {
      const site = sites[cursor++];
      if (!site) return;

      results.append(await measureSite(site, preload, requests.append));
      done++;

      if (done % PROGRESS_EVERY === 0) {
        const perMinute = done / ((Date.now() - started) / 60_000);
        console.log(`  ${num(done)}/${num(sites.length)}, ${perMinute.toFixed(1)} sites/min`);
      }
    }
  };

  await Promise.all(Array.from({ length: MEASUREMENT_LIMITS.concurrency }, worker));
  report();
}

async function measureSite(
  site: Site,
  preload: Map<string, boolean>,
  log: (entry: RequestLogEntry) => void,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const measuredAt = new Date();
  const limiter = pacer();
  const deadline = startedAt + MEASUREMENT_LIMITS.domainDeadlineMs;

  const record: Record<string, unknown> = {
    site_id: site.site_id,
    domain: site.domain,
    stratum: site.stratum,
    sector: site.sector,
    crux_best_bucket: site.crux_best_bucket,
    measured_at: measuredAt.toISOString(),
    bot_blocked_expected: Number(site.bot_blocked || 0),
    reachable: null,
    measurement_status: null,
    note: "",
  };

  const finish = (status: string, extra: Record<string, unknown> = {}) => ({
    ...record,
    ...extra,
    measurement_status: status,
    elapsed_s: round((Date.now() - startedAt) / 1000, 1),
  });

  const robots = await readRobots(site.domain, limiter, log, deadline);
  if (robots.dnsDead) return finish("dns_dead", { reachable: false });

  record["robots_allows_root"] = robots.allowsRoot;
  record["robots_crawl_delay"] = robots.crawlDelay;

  if (!robots.allowsRoot) {
    return finish("excluded_by_robots", { note: "robots.txt disallows the root page" });
  }
  limiter.requireGap(robots.crawlDelay);

  const plain = await get(`http://${site.domain}/`, site.domain, "http", limiter, log);
  if (plain.ok) {
    record["http_reachable"] = true;
    record["http_status_code"] = plain.response.status;
    record["http_to_https_redirect"] = plain.response.finalUrl.startsWith("https://");
    record["http_final_url"] = plain.response.finalUrl;
    record["http_redirect_chain"] = plain.response.chain;
  } else {
    record["http_reachable"] = false;
    record["http_to_https_redirect"] = null;
    record["http_note"] = plain.note;
  }

  if (Date.now() > deadline) return finish("domain_timeout", { reachable: false });

  const home = await get(`https://${site.domain}/`, site.domain, "home", limiter, log);
  if (!home.ok) {
    const tls = await measureTls(site.domain, measuredAt, () => limiter.takeTurn());
    return finish("unreachable_https", { reachable: false, note: home.note, ...tls });
  }

  const { status, headers, finalUrl, body, chain, setCookies } = home.response;
  const headerBag = new HeaderBag([...headers]);
  const contentType = (headers.get("content-type") ?? "").split(";")[0]!.toLowerCase();
  const overHttps = finalUrl.startsWith("https://");
  const csp = parseCsp(headerBag);

  Object.assign(record, {
    reachable: true,
    status_code: status,
    final_url: finalUrl,
    final_url_scheme: overHttps ? "https" : "http",
    content_type: contentType,
    redirect_chain: chain,
    bot_blocked_observed: BOT_WALL_STATUSES.has(status),
    ...parseHsts(headerBag, overHttps),
    ...csp,
    ...parseFraming(headerBag, csp),
    ...parseOtherHeaders(headerBag),
    ...parseCookies(setCookies),
    header_names_seen: headerBag.names(),
    hsts_in_preload_list: inPreloadList(site.domain, preload),
    html_bytes: body.length,
  });

  const html = contentType.includes("html") ? Buffer.from(body).toString("utf-8") : "";
  record["mixed_content_count"] = html ? countMixedContent(html, overHttps) : null;

  Object.assign(record, await readSecurityTxt(site.domain, limiter, log, deadline, robots));
  Object.assign(record, await measureTls(site.domain, measuredAt, () => limiter.takeTurn()));

  return finish("ok");
}

function get(
  url: string,
  domain: string,
  kind: string,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
) {
  return guardedGet(url, domain, kind, limiter, log, MEASUREMENT_LIMITS);
}

type Robots = {
  allowsRoot: boolean;
  crawlDelay: number | null;
  allows: (p: string) => boolean;

  parsed: boolean;
  dnsDead: boolean;
};

async function readRobots(
  domain: string,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
  deadline: number,
): Promise<Robots> {
  const permissive: Robots = {
    allowsRoot: true,
    crawlDelay: null,
    allows: () => true,
    parsed: false,
    dnsDead: false,
  };

  const secure = await get(`https://${domain}/robots.txt`, domain, "robots", limiter, log);
  let outcome = secure;

  if (!secure.ok && secure.reason !== "rate_limited" && Date.now() <= deadline) {
    outcome = await get(`http://${domain}/robots.txt`, domain, "robots", limiter, log);

    if (!outcome.ok && outcome.reason === "dns_dead" && secure.reason === "dns_dead") {
      return { ...permissive, dnsDead: true };
    }
  }

  if (!outcome.ok || outcome.response.status !== 200) return permissive;

  const robots = parseRobots(Buffer.from(outcome.response.body).toString("utf-8"), userAgent());
  return {
    allowsRoot: robots.allows("/"),
    crawlDelay: robots.crawlDelay,
    allows: robots.allows,
    parsed: true,
    dnsDead: false,
  };
}

async function readSecurityTxt(
  domain: string,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
  deadline: number,
  robots: Robots,
) {
  if (!robots.parsed || !robots.allows(SECURITY_TXT_PATH) || Date.now() > deadline) {
    return parseSecurityTxt(null, null, null);
  }

  const outcome = await get(`https://${domain}${SECURITY_TXT_PATH}`, domain, "securitytxt", limiter, log);
  if (!outcome.ok) return parseSecurityTxt(null, null, null);

  return parseSecurityTxt(
    outcome.response.status,
    outcome.response.headers.get("content-type"),
    Buffer.from(outcome.response.body).toString("utf-8").slice(0, SECURITY_TXT_LIMIT),
  );
}

function inPreloadList(domain: string, preload: Map<string, boolean>): boolean | null {
  if (preload.size === 0) return null;

  const name = domain.toLowerCase().replace(/\.+$/, "");
  if (preload.has(name)) return true;

  const labels = name.split(".");
  for (let i = 1; i < labels.length - 1; i++) {
    if (preload.get(labels.slice(i).join(".")) === true) return true;
  }
  return false;
}

function readPreloadList(): Map<string, boolean> {
  if (!fs.existsSync(HSTS_PRELOAD.file)) return new Map();

  const raw = readJson<{ domains?: Record<string, boolean> }>(HSTS_PRELOAD.file);
  return new Map(Object.entries(raw.domains ?? {}));
}

async function assertFrameUnchanged(): Promise<void> {
  if (await matchesExpected(SAMPLE_FRAME)) return;

  throw new Error(
    `${SAMPLE_FRAME} does not carry the expected sha256.\n` +
      "If the frame changed on purpose, update expected/outputs.json and start the\n" +
      "measurement again from scratch.",
  );
}

async function pendingSites(): Promise<Site[]> {
  const done = new Set<string>();
  if (fs.existsSync(OUTPUT)) {
    for (const line of fs.readFileSync(OUTPUT, "utf-8").split("\n")) {
      if (line.trim() === "") continue;
      try {
        done.add(JSON.parse(line).domain);
      } catch {
      }
    }
  }

  const sites: Site[] = [];
  for await (const row of readRows(SAMPLE_FRAME)) {
    const domain = row["domain"] ?? "";
    if (done.has(domain)) continue;

    sites.push({
      site_id: row["site_id"] ?? "",
      domain,
      stratum: row["stratum"] ?? "",
      sector: row["sector"] ?? "",
      crux_best_bucket: row["crux_best_bucket"] ?? "",
      bot_blocked: row["bot_blocked"] ?? "0",
    });
  }

  console.log(`  whole frame, ${num(done.size)} done, ${num(sites.length)} left`);
  return sites;
}

function openJsonl(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const handle = fs.openSync(file, "a");

  return {
    append(entry: unknown) {
      fs.writeSync(handle, JSON.stringify(entry) + "\n");
    },
  };
}

function report(): void {
  const records = fs
    .readFileSync(OUTPUT, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  const byStatus: Record<string, number> = {};
  for (const record of records) {
    const status = String(record["measurement_status"]);
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  writeJson(PROVENANCE, {
    step: "04 - security measurement",
    generated_on: today(),
    limits: MEASUREMENT_LIMITS,
    input: { file: rel(SAMPLE_FRAME) },
    output: { file: rel(OUTPUT), rows: records.length, by_status: byStatus },
    client: "plain HTTP; no browser was used, so cookies set by JavaScript were not measured",
  });

  for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${status.padEnd(20)} ${num(count).padStart(5)}`);
  }
  console.log(`  wrote ${rel(OUTPUT)}`);
}
