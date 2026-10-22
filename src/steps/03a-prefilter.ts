import path from "node:path";
import { writeCsv, type CsvRow } from "../utils/csv.ts";
import { publicSuffix } from "../domains.ts";
import { writeJson } from "../utils/files.ts";
import { byCountDescending, countBy, num, today } from "../utils/format.ts";
import { seededRandom } from "../utils/mt19937.ts";
import { OUT, rel } from "../utils/paths.ts";
import { byDomain, byRank } from "../utils/sorting.ts";
import type { CandidateRow, CrawlRow, Stratum } from "../types.ts";

export const OUTPUT = path.join(OUT, "crawl_list.csv");
const PROVENANCE = path.join(OUT, "_provenance_03a_prefilter.json");

const COLUMNS = ["domain", "stratum", "crux_best_bucket", "tranco_rank", "source", "is_tr_tld"];

const SEED = 20260927;

const MAX_CRUX_BUCKET = 100_000;

const LARGE_BUCKET = 10_000;
const MEDIUM_BUCKET = 50_000;

const DROP_REASONS = {
  lowTraffic: "bucket>100000 or absent from CrUX",
  nonCommercialTr: "a non-commercial .tr suffix",
  infrastructure: "an infrastructure or advertising endpoint",
  globalNonShop: "a global service that does not sell",
};

type DropReason = keyof typeof DROP_REASONS;

const NONCOMMERCIAL_TR = new Set([
  "gov.tr", "edu.tr", "bel.tr", "k12.tr", "pol.tr", "tsk.tr", "av.tr", "kep.tr", "dr.tr", "name.tr",
]);

const INFRASTRUCTURE = new Set([
  "adtarget.com.tr", "pixad.com.tr", "admatic.com.tr", "metunic.com.tr", "reklamstore.com",
  "gstatic.com", "googleapis.com", "googlesyndication.com", "googletagmanager.com",
  "google-analytics.com", "doubleclick.net", "cloudflare.com", "cloudfront.net",
  "akamaihd.net", "akamaized.net", "fbcdn.net", "licdn.com", "jsdelivr.net", "unpkg.com",
  "bootstrapcdn.com", "cloudflareinsights.com", "hotjar.com", "criteo.com", "taboola.com",
  "outbrain.com", "adnxs.com", "rubiconproject.com", "pubmatic.com", "casalemedia.com",
]);
const INFRASTRUCTURE_SUFFIXES = ["cdn.com", "-cdn.net", ".cdn.tr"];

const GLOBAL_NON_SHOPS = new Set([
  "google.com", "google.com.tr", "youtube.com", "facebook.com", "instagram.com", "whatsapp.com",
  "x.com", "twitter.com", "tiktok.com", "linkedin.com", "wikipedia.org", "microsoft.com",
  "live.com", "office.com", "apple.com", "icloud.com", "yandex.com.tr", "yandex.com",
  "bing.com", "duckduckgo.com", "reddit.com", "pinterest.com", "telegram.org", "zoom.us",
  "netflix.com", "spotify.com", "github.com", "stackoverflow.com", "mozilla.org",
  "flashscore.com.tr", "tripadvisor.com.tr", "trivago.com.tr",
]);

const DOMAIN_RULES: Array<{ reason: DropReason; applies: (domain: string) => boolean }> = [
  {
    reason: "nonCommercialTr",
    applies: (domain) => NONCOMMERCIAL_TR.has(publicSuffix(domain)),
  },
  {
    reason: "infrastructure",
    applies: (domain) =>
      INFRASTRUCTURE.has(domain) || INFRASTRUCTURE_SUFFIXES.some((end) => domain.endsWith(end)),
  },
  {
    reason: "globalNonShop",
    applies: (domain) => GLOBAL_NON_SHOPS.has(domain),
  },
];

const STRATA: Stratum[] = ["A_buyuk", "B_orta", "C_kucuk"];

const SAMPLE_SIZE: Record<Stratum, number | null> = {
  A_buyuk: null,
  B_orta: 4000,
  C_kucuk: 4000,
};

function stratumOf(bucket: number): Stratum {
  if (bucket <= LARGE_BUCKET) return "A_buyuk";
  if (bucket === MEDIUM_BUCKET) return "B_orta";
  return "C_kucuk";
}

type StratumSummary = {
  stratum: Stratum;
  size: number;
  selected: number;

  probability: number;
};

export function prefilter(frame: CandidateRow[]): CrawlRow[] {
  const { kept, drops } = screenAll(frame);
  const { selected, sampling } = drawSample(kept);

  writeCsv(OUTPUT, COLUMNS, selected.map(toCsvRow));
  writeProvenance(frame.length, drops, kept.length, selected, sampling);
  report(frame.length, drops, kept.length, selected, sampling);

  return selected;
}

type Screened = { kept: false; reason: DropReason } | { kept: true; bucket: number };

function screen(row: CandidateRow): Screened {
  const bucket = row.crux_best_bucket;
  if (bucket === null || bucket > MAX_CRUX_BUCKET) return { kept: false, reason: "lowTraffic" };

  const rule = DOMAIN_RULES.find((candidate) => candidate.applies(row.domain));
  return rule ? { kept: false, reason: rule.reason } : { kept: true, bucket };
}

function screenAll(frame: CandidateRow[]) {
  const kept: CrawlRow[] = [];
  const drops = new Map<DropReason, number>();

  for (const row of frame) {
    const result = screen(row);

    if (!result.kept) {
      drops.set(result.reason, (drops.get(result.reason) ?? 0) + 1);
      continue;
    }

    kept.push({
      domain: row.domain,
      stratum: stratumOf(result.bucket),
      crux_best_bucket: result.bucket,
      tranco_rank: row.tranco_rank,
      source: row.source,
      is_tr_tld: row.is_tr_tld,
    });
  }

  return { kept, drops };
}

function drawSample(kept: CrawlRow[]) {
  const random = seededRandom(SEED);
  const sampling: StratumSummary[] = [];
  const selected: CrawlRow[] = [];

  for (const stratum of STRATA) {
    const pool = kept
      .filter((row) => row.stratum === stratum)
      .sort((a, b) => byDomain(a.domain, b.domain));

    const target = SAMPLE_SIZE[stratum];
    const takeAll = target === null || target >= pool.length;
    const taken = takeAll ? pool : random.sample(pool, target);

    sampling.push({
      stratum,
      size: pool.length,
      selected: taken.length,
      probability: takeAll ? 1 : Number((target / pool.length).toFixed(6)),
    });
    selected.push(...taken);
  }

  selected.sort(
    (a, b) =>
      STRATA.indexOf(a.stratum) - STRATA.indexOf(b.stratum) ||
      a.crux_best_bucket - b.crux_best_bucket ||
      byRank(a.tranco_rank, b.tranco_rank) ||
      byDomain(a.domain, b.domain),
  );

  return { selected, sampling };
}

function toCsvRow(row: CrawlRow): CsvRow {
  return {
    domain: row.domain,
    stratum: row.stratum,
    crux_best_bucket: row.crux_best_bucket,
    tranco_rank: row.tranco_rank ?? "",
    source: row.source,
    is_tr_tld: row.is_tr_tld ? 1 : 0,
  };
}

function labelledDrops(drops: Map<DropReason, number>): Array<[string, number]> {
  const labelled: Record<string, number> = {};
  for (const [reason, count] of drops) labelled[DROP_REASONS[reason]] = count;
  return byCountDescending(labelled);
}

function writeProvenance(
  inputRows: number,
  drops: Map<DropReason, number>,
  keptCount: number,
  selected: CrawlRow[],
  sampling: StratumSummary[],
): void {
  writeJson(PROVENANCE, {
    step: "3a - pre-filter plus stratified sampling",
    generated_on: today(),
    seed: SEED,
    input_rows: inputRows,
    dropped: Object.fromEntries(labelledDrops(drops)),
    kept_after_prefilter: keptCount,
    strata_definition: {
      A_buyuk: `CrUX bucket <=${LARGE_BUCKET}`,
      B_orta: `CrUX bucket =${MEDIUM_BUCKET}`,
      C_kucuk: `CrUX bucket =${MAX_CRUX_BUCKET}`,
      note: `CrUX bucket'i ${MAX_CRUX_BUCKET} ustu olanlar ve CrUX'te olmayanlar taranmaz`,
    },
    sampling,
    output: {
      file: rel(OUTPUT),
      rows: selected.length,
      by_stratum: countBy(selected, (row) => row.stratum),
      tr_tld: selected.filter((row) => row.is_tr_tld).length,
    },
    request_budget: {
      per_domain: 2,
      total_estimate: selected.length * 2,
      note: "robots.txt and the root page, at most one request per second per site.",
    },
  });
}

function report(
  inputRows: number,
  drops: Map<DropReason, number>,
  keptCount: number,
  selected: CrawlRow[],
  sampling: StratumSummary[],
): void {
  console.log(`  ${num(keptCount)} of ${num(inputRows)} candidates passed the prefilter`);

  for (const [label, count] of labelledDrops(drops)) {
    console.log(`    dropped ${num(count)}: ${label}`);
  }

  for (const { stratum, size, selected: count, probability } of sampling) {
    const how = probability === 1 ? "all of them" : `probability ${probability.toFixed(4)}`;
    console.log(`    ${stratum}: picked ${num(count)} of ${num(size)} (${how})`);
  }

  console.log(`  ${num(selected.length)} domains to crawl, about ${num(selected.length * 2)} requests`);
  console.log(`  wrote ${rel(OUTPUT)}`);
}
