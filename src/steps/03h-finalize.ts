import path from "node:path";
import { BLOCKED_SHORTLIST, REVIEW_TABLE, SOFTWALL_SHORTLIST } from "../datasets.ts";
import { readRows, writeCsv } from "../utils/csv.ts";
import { writeJson } from "../utils/files.ts";
import { countBy, formatCounts, num, today, truncate } from "../utils/format.ts";
import { OUT, rel } from "../utils/paths.ts";
import { byDomain, byRank } from "../utils/sorting.ts";
import { POOL } from "./03c-pool.ts";

export const OUTPUT = path.join(OUT, "sample_frame.csv");
const PROVENANCE = path.join(OUT, "_provenance_03h_frame.json");

const COLUMNS = ["site_id", "domain", "stratum", "crux_best_bucket", "sector", "sector_source",
  "verified", "bot_blocked", "evidence"];

const EVIDENCE_LIMIT = 170;

const SELECTION_PROBABILITY = {
  A_buyuk: 0.1822,
  B_orta: 0.2464,
  C_kucuk: 0.2261,
  D_botduvari: "1.0 (all 35 pre-screened records were reviewed)",
};

export type FrameRow = {
  site_id: string;
  domain: string;
  stratum: string;
  crux_best_bucket: string;
  sector: string;
  sector_source: string;
  verified: string;
  bot_blocked: number;
  evidence: string;
};

export async function finalizeFrame(): Promise<FrameRow[]> {
  const buckets = await cruxBuckets();
  const rows: Omit<FrameRow, "site_id">[] = [];

  for await (const row of readRows(REVIEW_TABLE.file)) {
    if (row["oneri"] === "hayir" || row["manual_verified"] === "hayir") continue;

    const sectorFinal = row["sector_final"] ?? "";
    rows.push({
      domain: row["domain"] ?? "",
      stratum: row["stratum"] ?? "",
      crux_best_bucket: buckets.get(row["domain"] ?? "") ?? "",
      sector: sectorFinal || (row["sector_auto"] ?? ""),
      sector_source: sectorFinal ? "manual" : "auto_suggested",
      verified: row["manual_verified"] === "evet" ? "manual" : "evidence_based",
      bot_blocked: 0,
      evidence: truncate(row["tarayici_kanit"] || (row["oneri_gerekce"] ?? ""), EVIDENCE_LIMIT),
    });
  }

  for (const source of [BLOCKED_SHORTLIST.file, SOFTWALL_SHORTLIST.file]) {
    for await (const row of readRows(source)) {
      if (row["is_ecommerce"] !== "evet") continue;

        rows.push({
        domain: row["domain"] ?? "",
        stratum: "D_botduvari",
        crux_best_bucket: row["crux_best_bucket"] ?? "",
        sector: row["sector_final"] || "diger",
        sector_source: "manual",
        verified: "manual",
        bot_blocked: 1,
        evidence: truncate(row["evidence"] ?? "", EVIDENCE_LIMIT),
      });
    }
  }

  rows.sort(
    (a, b) =>
      byDomain(a.stratum, b.stratum) ||
      byRank(numberOrNull(a.crux_best_bucket), numberOrNull(b.crux_best_bucket)) ||
      byDomain(a.domain, b.domain),
  );

  const frame: FrameRow[] = rows.map((row, index) => ({
    site_id: `S${String(index + 1).padStart(3, "0")}`,
    ...row,
  }));

  writeCsv(OUTPUT, COLUMNS, frame);

  writeJson(PROVENANCE, {
    step: "3h - final sampling frame",
    generated_on: today(),
    rows: frame.length,
    by_stratum: countBy(frame, (row) => row.stratum),
    by_sector: countBy(frame, (row) => row.sector),
    verified: countBy(frame, (row) => row.verified),
    bot_blocked: frame.filter((row) => row.bot_blocked === 1).length,
    selection_probabilities: SELECTION_PROBABILITY,
    note:
      "D_botduvari is a stratum of its own. These sites could not be classified from their " +
      "content, so they never entered the pool and were added after checking by hand. " +
      "Their selection probability differs from the rest, so estimating a population " +
      "share from this frame needs weighting.",
  });

  console.log(`  final frame: ${num(frame.length)} sites`);
  console.log(`    stratum: ${formatCounts(countBy(frame, (row) => row.stratum))}`);
  console.log(`    sector:  ${formatCounts(countBy(frame, (row) => row.sector))}`);
  console.log(`    checked: ${formatCounts(countBy(frame, (row) => row.verified))}`);
  console.log(`  wrote ${rel(OUTPUT)}`);

  return frame;
}

async function cruxBuckets(): Promise<Map<string, string>> {
  const buckets = new Map<string, string>();
  for await (const row of readRows(POOL)) {
    buckets.set(row["domain"] ?? "", row["crux_best_bucket"] ?? "");
  }
  return buckets;
}

function numberOrNull(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}
