import path from "node:path";
import { readLines, writeCsv } from "../utils/csv.ts";
import { TRANCO } from "../datasets.ts";
import { publicSuffix } from "../domains.ts";
import { writeJson, sha256 } from "../utils/files.ts";
import { byCountDescending, countBy, num, today } from "../utils/format.ts";
import { OUT, rel } from "../utils/paths.ts";
import type { TrancoTrRow } from "../types.ts";

export const OUTPUT = path.join(OUT, "tranco_tr_slice.csv");
const PROVENANCE = path.join(OUT, "_provenance_01_tranco.json");

const COLUMNS = ["tranco_rank", "domain", "public_suffix"];

const TR_SUFFIX = ".tr";

export async function trancoSlice(): Promise<TrancoTrRow[]> {
  const rows: TrancoTrRow[] = [];
  let linesRead = 0;

  for await (const line of readLines(TRANCO.file)) {
    linesRead++;

    const separator = line.indexOf(",");
    const domain = line.slice(separator + 1);
    if (!domain.endsWith(TR_SUFFIX)) continue;

    rows.push({
      tranco_rank: Number(line.slice(0, separator)),
      domain,
      public_suffix: publicSuffix(domain),
    });
  }

  rows.sort((a, b) => a.tranco_rank - b.tranco_rank);

  writeCsv(OUTPUT, COLUMNS, rows);
  await writeProvenance(rows, linesRead);

  console.log(`  read ${num(linesRead)} rows, ${num(rows.length)} of them .tr`);
  console.log(`  wrote ${rel(OUTPUT)}`);

  return rows;
}

async function writeProvenance(rows: TrancoTrRow[], linesRead: number): Promise<void> {
  writeJson(PROVENANCE, {
    step: "1 - Tranco .tr slice",
    generated_on: today(),
    source: {
      ...TRANCO.provenance,
      file: rel(TRANCO.file),
      sha256: await sha256(TRANCO.file),
      rows: linesRead,
    },
    output: {
      file: rel(OUTPUT),
      rows: rows.length,
      suffix_distribution: Object.fromEntries(
        byCountDescending(countBy(rows, (row) => row.public_suffix)),
      ),
    },
    known_limitation:
      "Filtering on .tr alone does not capture Turkish e-commerce. Of 36 known Turkish " +
      "e-commerce domains, 35 are on this list but only 12 end in .tr; 23 sit on .com, and " +
      "so do the four largest (S403 #942, C03153 #1192, S074 " +
      "#3671, S278 #5679). That is why step 2 adds a second source, ranked by real " +
      "traffic from Turkey.",
  });
}
