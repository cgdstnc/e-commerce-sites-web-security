import path from "node:path";
import { readLines, writeCsv, type CsvRow } from "../utils/csv.ts";
import { CRUX, TRANCO } from "../datasets.ts";
import { hostFromOrigin, registrableDomain } from "../domains.ts";
import { writeJson, sha256 } from "../utils/files.ts";
import { countBy, formatCounts, num, today } from "../utils/format.ts";
import { OUT, rel } from "../utils/paths.ts";
import { byRank } from "../utils/sorting.ts";
import type { CandidateRow, TrancoTrRow } from "../types.ts";

export const OUTPUT = path.join(OUT, "candidate_frame.csv");
const PROVENANCE = path.join(OUT, "_provenance_02_merge.json");

const COLUMNS = ["domain", "source", "tranco_rank", "crux_best_bucket", "crux_origin_count", "is_tr_tld"];

export async function mergeCrux(trancoRows: TrancoTrRow[]): Promise<CandidateRow[]> {
  const bestTrancoRank = new Map<string, number>();
  const bestCruxBucket = new Map<string, number>();
  const cruxOriginCount = new Map<string, number>();

  for (const row of trancoRows) {
    const domain = registrableDomain(row.domain);
    if (domain) keepLowest(bestTrancoRank, domain, row.tranco_rank);
  }

  let originsRead = 0;
  let skipHeader = true;

  for await (const line of readLines(CRUX.file)) {
    if (skipHeader) {
      skipHeader = false;
      continue;
    }

    const separator = line.lastIndexOf(",");
    const domain = registrableDomain(hostFromOrigin(line.slice(0, separator)));
    if (!domain) continue;

    originsRead++;
    cruxOriginCount.set(domain, (cruxOriginCount.get(domain) ?? 0) + 1);
    keepLowest(bestCruxBucket, domain, Number(line.slice(separator + 1)));
  }

  const domains = new Set([...bestTrancoRank.keys(), ...bestCruxBucket.keys()]);
  const rows: CandidateRow[] = [...domains].map((domain) => {
    const trancoRank = bestTrancoRank.get(domain) ?? null;
    const cruxBucket = bestCruxBucket.get(domain) ?? null;

    return {
      domain,
      source: sourceOf(trancoRank, cruxBucket),
      tranco_rank: trancoRank,
      crux_best_bucket: cruxBucket,
      crux_origin_count: cruxOriginCount.get(domain) ?? 0,
      is_tr_tld: domain.endsWith(".tr"),
    };
  });

  rows.sort(
    (a, b) => byRank(a.crux_best_bucket, b.crux_best_bucket) || byRank(a.tranco_rank, b.tranco_rank),
  );

  writeCsv(OUTPUT, COLUMNS, rows.map(toCsvRow));
  await writeProvenance(rows, trancoRows.length, originsRead);

  console.log(`  read ${num(originsRead)} CrUX origins`);
  console.log(
    `  candidate frame: ${num(rows.length)} domains, ` +
      `${num(rows.filter(isTrTld).length)} tanesi .tr`,
  );
  console.log(`  source: ${formatCounts(countBy(rows, (row) => row.source))}`);
  console.log(`  wrote ${rel(OUTPUT)}`);

  return rows;
}

function keepLowest(best: Map<string, number>, key: string, value: number): void {
  const current = best.get(key);
  if (current === undefined || value < current) best.set(key, value);
}

function sourceOf(trancoRank: number | null, cruxBucket: number | null): CandidateRow["source"] {
  if (trancoRank !== null && cruxBucket !== null) return "both";
  return trancoRank !== null ? "tranco_tr" : "crux_tr";
}

const isTrTld = (row: CandidateRow) => row.is_tr_tld;

function toCsvRow(row: CandidateRow): CsvRow {
  return {
    domain: row.domain,
    source: row.source,
    tranco_rank: row.tranco_rank ?? "",
    crux_best_bucket: row.crux_best_bucket ?? "",
    crux_origin_count: row.crux_origin_count,
    is_tr_tld: row.is_tr_tld ? 1 : 0,
  };
}

async function writeProvenance(
  rows: CandidateRow[],
  trancoRows: number,
  originsRead: number,
): Promise<void> {
  writeJson(PROVENANCE, {
    step: "2 - merge Tranco .tr with CrUX Turkey",
    generated_on: today(),
    sources: {
      tranco_tr_slice: { list_id: TRANCO.provenance["list_id"], rows: trancoRows },
      crux_tr: {
        ...CRUX.provenance,
        file: rel(CRUX.file),
        sha256: await sha256(CRUX.file),
        origins_used: originsRead,
      },
    },
    output: {
      file: rel(OUTPUT),
      rows: rows.length,
      by_source: countBy(rows, (row) => row.source),
      tr_tld: rows.filter(isTrTld).length,
      by_crux_bucket: countBy(rows, (row) => String(row.crux_best_bucket ?? "")),
    },
    next_step: "3a - offline pre-filter plus stratified sampling",
  });
}
