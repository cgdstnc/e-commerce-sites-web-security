import path from "node:path";
import fs from "node:fs";
import type { Classification } from "./03b-classify.ts";
import { CLASSIFICATION } from "../datasets.ts";
import { guessSector, type Sector } from "../sectors.ts";
import { writeCsv, type CsvRow } from "../utils/csv.ts";
import { writeJson } from "../utils/files.ts";
import { countBy, formatCounts, num, today, truncate } from "../utils/format.ts";
import { seededRandom } from "../utils/mt19937.ts";
import { OUT, rel } from "../utils/paths.ts";
import { byDomain } from "../utils/sorting.ts";
import type { Stratum } from "../types.ts";

export const POOL = path.join(OUT, "validated_pool.csv");
export const DRAFT_FRAME = path.join(OUT, "sample_frame_draft.csv");
export const BLOCKED_REVIEW = path.join(OUT, "manual_review_blocked.csv");
const PROVENANCE = path.join(OUT, "_provenance_03c_pool.json");

const SEED = 20260927;
const PER_STRATUM = 135;

const MIN_ECOM_SCORE = 8;
const MIN_CART_SIGNALS = 1;

const STRATA: Stratum[] = ["A_buyuk", "B_orta", "C_kucuk"];

export type PoolRow = {
  domain: string;
  stratum: string;
  crux_best_bucket: string;
  ecom_score: number;
  cart: number;
  buy: number;
  shop_links: number;
  platform: number;
  price: number;
  schema_product: number;
  final_scheme: string;
  title: string;
  sector_auto: Sector;
  sector_keywords: string;
};

export function buildPool(): PoolRow[] {
  const pool: PoolRow[] = [];

  for (const record of readClassification()) {
    const signals = record.signals;
    if (record.status !== "ok" || !signals) continue;
    if (!signals.is_turkish || signals.looks_parked) continue;
    if (signals.ecom_score < MIN_ECOM_SCORE || signals.cart < MIN_CART_SIGNALS) continue;

    const guess = guessSector(record.domain, signals.title);
    pool.push({
      domain: record.domain,
      stratum: record.stratum,
      crux_best_bucket: record.crux_best_bucket,
      ecom_score: signals.ecom_score,
      cart: signals.cart,
      buy: signals.buy,
      shop_links: signals.shop_links,
      platform: signals.platform,
      price: signals.price,
      schema_product: signals.schema_product ? 1 : 0,
      final_scheme: record.final_scheme ?? "",
      title: truncate(signals.title || "", 120),
      sector_auto: guess.sector,
      sector_keywords: guess.keywords,
    });
  }

  pool.sort(
    (a, b) =>
      byDomain(a.stratum, b.stratum) || b.ecom_score - a.ecom_score || byDomain(a.domain, b.domain),
  );
  return pool;
}

export function drawDraftSample(pool: PoolRow[]) {
  const random = seededRandom(SEED);
  const allocation: Array<{ stratum: Stratum; pool: number; selected: number; probability: number }> = [];
  const selected: PoolRow[] = [];

  for (const stratum of STRATA) {
    const subset = pool.filter((row) => row.stratum === stratum).sort((a, b) => byDomain(a.domain, b.domain));
    const take = Math.min(PER_STRATUM, subset.length);

    allocation.push({
      stratum,
      pool: subset.length,
      selected: take,
      probability: Number((take / subset.length).toFixed(6)),
    });
    selected.push(...random.sample(subset, take));
  }

  selected.sort((a, b) => byDomain(a.stratum, b.stratum) || byDomain(a.domain, b.domain));
  return { selected, allocation };
}

export function pool(): PoolRow[] {
  const rows = buildPool();
  const { selected, allocation } = drawDraftSample(rows);
  const blocked = blockedForReview();

  writeCsv(POOL, Object.keys(rows[0] ?? {}), rows as unknown as CsvRow[]);

  writeCsv(
    DRAFT_FRAME,
    ["site_id", "domain", "stratum", "crux_best_bucket", "sector_auto", "sector_final",
      "manual_verified", "exclude_reason", "verified_on", "ecom_score", "cart", "buy",
      "shop_links", "platform", "price", "schema_product", "final_scheme",
      "sector_keywords", "title"],
    selected.map((row, index) => ({
      ...row,
      site_id: `S${String(index + 1).padStart(3, "0")}`,
      sector_final: "",
      manual_verified: "",
      exclude_reason: "",
      verified_on: "",
    })),
  );

  writeCsv(
    BLOCKED_REVIEW,
    ["domain", "stratum", "crux_best_bucket", "http_status", "security_headers_seen",
      "is_ecommerce", "sector_final", "verified_on", "note"],
    blocked,
  );

  writeJson(PROVENANCE, {
    step: "3c - candidate pool, suggested sector, draft sample",
    generated_on: today(),
    seed: SEED,
    rule: `status=ok AND is_turkish AND NOT looks_parked AND ecom_score>=${MIN_ECOM_SCORE} AND cart>=${MIN_CART_SIGNALS}`,
    rule_doc: "docs/sector_labels.md",
    pool: {
      file: rel(POOL),
      rows: rows.length,
      by_stratum: countBy(rows, (row) => row.stratum),
      by_sector_auto: countBy(rows, (row) => row.sector_auto),
    },
    draft_sample: {
      file: rel(DRAFT_FRAME),
      rows: selected.length,
      per_stratum: PER_STRATUM,
      allocation,
      by_sector_auto: countBy(selected, (row) => row.sector_auto),
    },
    blocked_manual: { file: rel(BLOCKED_REVIEW), rows: blocked.length },
    status: "DRAFT - not final until every row has been checked by hand",
  });

  console.log(`  candidate pool: ${num(rows.length)} sites`);
  console.log(`    stratum: ${formatCounts(countBy(rows, (row) => row.stratum))}`);
  console.log(`    sector:  ${formatCounts(countBy(rows, (row) => row.sector_auto))}`);
  for (const entry of allocation) {
    console.log(
      `    ${entry.stratum}: ${num(entry.pool)} havuzdan ${entry.selected} secildi (olasilik ${entry.probability.toFixed(4)})`,
    );
  }
  console.log(`  draft sample ${num(selected.length)} sites, ${num(blocked.length)} bot-walled sites to check by hand`);
  console.log(`  wrote ${rel(POOL)}`);

  return rows;
}

function blockedForReview(): CsvRow[] {
  return readClassification()
    .filter((record) => record.status === "blocked")
    .sort(
      (a, b) =>
        byDomain(a.stratum, b.stratum) ||
        Number(a.crux_best_bucket) - Number(b.crux_best_bucket) ||
        byDomain(a.domain, b.domain),
    )
    .map((record) => ({
      domain: record.domain,
      stratum: record.stratum,
      crux_best_bucket: record.crux_best_bucket,
      http_status: record.http_status ?? "",
      security_headers_seen: (record.security_headers_seen ?? []).join(";"),
      is_ecommerce: "",
      sector_final: "",
      verified_on: "",
      note: record.note,
    }));
}

let cached: Classification[] | null = null;

function readClassification(): Classification[] {
  cached ??= fs
    .readFileSync(CLASSIFICATION.file, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Classification);

  return cached;
}
