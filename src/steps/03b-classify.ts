import fs from "node:fs";
import path from "node:path";
import { classify, type Signals } from "../classify.ts";
import { guardedGet, LIMITS, pacer, userAgent, type Outcome, type Pacer, type RequestLogEntry } from "../ethics.ts";
import { MEASUREMENT_REQUEST_LOG, REQUEST_LOG as FROZEN_REQUEST_LOG } from "../datasets.ts";
import { readRows } from "../utils/csv.ts";
import { writeJson } from "../utils/files.ts";
import { countBy, num, today } from "../utils/format.ts";
import { OUT, rel } from "../utils/paths.ts";
import { parseRobots } from "../utils/robots.ts";
import { matchesExpected } from "../verify.ts";
import { OUTPUT as CRAWL_LIST } from "./03a-prefilter.ts";

export const OUTPUT = path.join(OUT, "classification.jsonl");
export const REQUEST_LOG = path.join(OUT, "request_log.jsonl");
const PROVENANCE = path.join(OUT, "_provenance_03b_classify.json");

const SECURITY_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

const BOT_WALL_STATUSES = new Set([401, 403, 406, 451]);

const PROGRESS_EVERY = 250;

export type Status =
  | "ok"
  | "blocked"
  | "unreachable"
  | "no_html"
  | "excluded_by_robots"
  | "skipped";

export type Classification = {
  domain: string;
  stratum: string;
  crux_best_bucket: string;
  measured_at: string;
  status: Status;
  note: string;
  signals: Signals | null;
  robots_allows_root?: boolean;
  crawl_delay?: number | null;
  http_status?: number;
  final_url?: string;
  final_scheme?: string;
  content_type?: string;
  server?: string | null;
  security_headers_seen?: string[];
};

type Target = { domain: string; stratum: string; crux_best_bucket: string };

export async function classifyDomains(limit?: number): Promise<void> {
  userAgent();
  await assertFrameUnchanged();

  const all = await pendingTargets();
  const targets = limit ? all.slice(0, limit) : all;
  if (targets.length === 0) {
    console.log("  the crawl is already complete, nothing to do");
    return;
  }

  console.log(`  concurrency ${LIMITS.concurrency}, roughly ${estimateHours(targets.length)} hours`);

  const results = openJsonl(OUTPUT);
  const requests = openJsonl(REQUEST_LOG);
  const progress = tracker(targets.length);

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      if (!target) return;

      results.append(await visit(target, requests.append));
      progress.advance();
    }
  };

  await Promise.all(Array.from({ length: LIMITS.concurrency }, worker));

  report();
}

async function assertFrameUnchanged(): Promise<void> {
  if (await matchesExpected(CRAWL_LIST)) return;

  throw new Error(
    `${CRAWL_LIST} does not carry the expected sha256.\n` +
      "If the frame changed on purpose, update expected/outputs.json and\n" +
      "start again from scratch, otherwise data from two different frames gets mixed.",
  );
}

async function pendingTargets(): Promise<Target[]> {
  const done = completedDomains();
  const targets: Target[] = [];
  let total = 0;

  for await (const row of readRows(CRAWL_LIST)) {
    total++;
    const domain = row["domain"] ?? "";
    if (done.has(domain)) continue;

    targets.push({
      domain,
      stratum: row["stratum"] ?? "",
      crux_best_bucket: row["crux_best_bucket"] ?? "",
    });
  }

  console.log(`  ${num(total)} in total, ${num(done.size)} done, ${num(targets.length)} left`);
  return targets;
}

function completedDomains(): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(OUTPUT)) return done;

  for (const record of readJsonl<Classification>(OUTPUT)) done.add(record.domain);
  return done;
}

async function visit(target: Target, log: (entry: RequestLogEntry) => void): Promise<Classification> {
  const record: Classification = {
    ...target,
    measured_at: new Date().toISOString(),
    status: "unreachable",
    note: "",
    signals: null,
  };

  const limiter = pacer();
  const deadline = Date.now() + LIMITS.domainDeadlineMs;

  const robots = await readRobots(target.domain, limiter, log, deadline);
  if ("stopWith" in robots) {
    return { ...record, status: robots.stopWith, note: robots.note };
  }

  record.robots_allows_root = robots.allowsRoot;
  record.crawl_delay = robots.crawlDelay;

  if (!robots.allowsRoot) {
    return { ...record, status: "excluded_by_robots", note: "robots.txt disallows the root page" };
  }

  limiter.requireGap(robots.crawlDelay);

  if (Date.now() > deadline) {
    return { ...record, status: "unreachable", note: "the domain timed out while fetching robots.txt" };
  }

  const home = await fetchEitherScheme(target.domain, "/", "home", limiter, log, deadline);
  if (!home.ok) {
    return {
      ...record,
      status: home.reason === "rate_limited" ? "skipped" : "unreachable",
      note: home.note,
    };
  }

  const { status, headers, finalUrl, body } = home.response;
  const contentType = (headers.get("content-type") ?? "").toLowerCase();

  record.http_status = status;
  record.final_url = finalUrl;
  record.final_scheme = new URL(finalUrl).protocol.replace(":", "");
  record.content_type = contentType.split(";")[0] ?? "";
  record.server = headers.get("server");
  record.security_headers_seen = SECURITY_HEADERS.filter((name) => headers.has(name));

  if (BOT_WALL_STATUSES.has(status)) {
    return { ...record, status: "blocked", note: `bot duvari: status=${status}` };
  }

  if (status >= 400 || !record.content_type.includes("html")) {
    return { ...record, status: "no_html", note: `status=${status} ctype=${record.content_type}` };
  }

  return { ...record, status: "ok", signals: classify(decode(body, contentType)) };
}

type Robots = { allowsRoot: boolean; crawlDelay: number | null };

async function readRobots(
  domain: string,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
  deadline: number,
): Promise<Robots | { stopWith: Status; note: string }> {
  const outcome = await fetchEitherScheme(domain, "/robots.txt", "robots", limiter, log, deadline);

  if (!outcome.ok) {
    if (outcome.reason === "dns_dead") return { stopWith: "unreachable", note: "dns_dead" };
    if (outcome.reason === "rate_limited") return { stopWith: "skipped", note: outcome.note };

    return { allowsRoot: true, crawlDelay: null };
  }

  if (outcome.response.status !== 200) return { allowsRoot: true, crawlDelay: null };

  const robots = parseRobots(Buffer.from(outcome.response.body).toString("utf-8"), userAgent());
  return { allowsRoot: robots.allows("/"), crawlDelay: robots.crawlDelay };
}

async function fetchEitherScheme(
  domain: string,
  requestPath: string,
  kind: string,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
  deadline: number,
): Promise<Outcome> {
  const secure = await guardedGet(`https://${domain}${requestPath}`, domain, kind, limiter, log);

  const settled = secure.ok || secure.reason === "dns_dead" || secure.reason === "rate_limited";
  if (settled || Date.now() > deadline) return secure;

  return guardedGet(`http://${domain}${requestPath}`, domain, kind, limiter, log);
}

function decode(body: Uint8Array, contentType: string): string {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
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

function readJsonl<T>(file: string): T[] {
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

function tracker(total: number) {
  const started = Date.now();
  let done = 0;

  return {
    advance() {
      done++;
      if (done % PROGRESS_EVERY !== 0) return;

      const perSecond = done / ((Date.now() - started) / 1000);
      const minutesLeft = ((total - done) / perSecond / 60).toFixed(0);
      console.log(`  ${num(done)}/${num(total)}, about ${minutesLeft} min left`);
    },
  };
}

function estimateHours(domains: number): string {
  const secondsPerDomain = (LIMITS.perSiteGapMs / 1000) * 2 + 1;
  return ((domains * secondsPerDomain) / LIMITS.concurrency / 3600).toFixed(1);
}

function report(): void {
  const records = readJsonl<Classification>(OUTPUT);
  const byStatus = countBy(records, (record) => record.status);
  const usable = records.filter((record) => record.status === "ok");

  for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    const share = ((count / records.length) * 100).toFixed(1);
    console.log(`    ${status.padEnd(18)} ${num(count).padStart(7)}  %${share}`);
  }

  writeJson(PROVENANCE, {
    step: "3b - passive classification crawl",
    generated_on: today(),
    limits: LIMITS,
    input: { file: rel(CRAWL_LIST), rows: records.length },
    output: {
      file: rel(OUTPUT),
      rows: records.length,
      by_status: byStatus,
      turkish: usable.filter((record) => record.signals?.is_turkish).length,
      parked: usable.filter((record) => record.signals?.looks_parked).length,
    },
    note: "the HTML was not kept, only the signals we derived from it and <title>.",
  });

  console.log(`  wrote ${rel(OUTPUT)}`);
  console.log(`  request log ${rel(REQUEST_LOG)}`);
}

export function auditRequestLogs(): void {
  const logs = [
    ["classification crawl (frozen)", FROZEN_REQUEST_LOG.file],
    ["security measurement (frozen)", MEASUREMENT_REQUEST_LOG.file],
    ["classification crawl (local run)", REQUEST_LOG],
    ["security measurement (local run)", path.join(OUT, "measurement_request_log.jsonl")],
  ] as const;

  for (const [label, file] of logs) {
    if (!fs.existsSync(file)) continue;
    console.log(`  ${label}`);
    auditRequestLog(file);
  }
}

function auditRequestLog(file: string): void {
  const entries = readJsonl<RequestLogEntry>(file);
  const byDomain = new Map<string, number[]>();

  for (const entry of entries) {
    const times = byDomain.get(entry.domain) ?? [];
    times.push(Date.parse(entry.ts));
    byDomain.set(entry.domain, times);
  }

  let violations = 0;
  let smallestGap = Infinity;

  for (const times of byDomain.values()) {
    times.sort((a, b) => a - b);

    for (let i = 1; i < times.length; i++) {
      const gap = (times[i] ?? 0) - (times[i - 1] ?? 0);
      smallestGap = Math.min(smallestGap, gap);
      if (gap < LIMITS.perSiteGapMs - 10) violations++;
    }
  }

  console.log(`    ${num(entries.length)} requests to ${num(byDomain.size)} domains`);
  console.log(`    shortest gap ${(smallestGap / 1000).toFixed(2)} s, violations ${violations}`);
}
