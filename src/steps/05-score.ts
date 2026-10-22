import fs from "node:fs";
import path from "node:path";
import { MEASUREMENTS } from "../datasets.ts";
import { scoreRecord, type Measurement, type Scores } from "../scoring.ts";
import { writeCsv } from "../utils/csv.ts";
import { writeJson } from "../utils/files.ts";
import { num, today } from "../utils/format.ts";
import { OUT, rel } from "../utils/paths.ts";
import { describe } from "../utils/stats.ts";

export const OUTPUT = path.join(OUT, "scores.csv");
const PROVENANCE = path.join(OUT, "_provenance_05_scores.json");

export type ScoredSite = { measurement: Measurement; scores: Scores };

export function scoreSites(): ScoredSite[] {
  const sites: ScoredSite[] = readMeasurements().map((measurement) => ({
    measurement,
    scores: scoreRecord(measurement),
  }));

  writeCsv(
    OUTPUT,
    ["site_id", "domain", "stratum", "sector", "header_score", "tls_score", "overall_score",
      "header_covered_weight", "tls_covered_weight"],
    sites.map(({ measurement, scores }) => ({
      site_id: String(measurement["site_id"]),
      domain: String(measurement["domain"]),
      stratum: String(measurement["stratum"]),
      sector: String(measurement["sector"]),
      header_score: scores.header_score,
      tls_score: scores.tls_score,
      overall_score: scores.overall_score,
      header_covered_weight: scores.header_detail.covered_weight,
      tls_covered_weight: scores.tls_detail.covered_weight,
    })),
  );

  const summary = {
    header_score: describe(sites.map((site) => site.scores.header_score)),
    tls_score: describe(sites.map((site) => site.scores.tls_score)),
    overall_score: describe(sites.map((site) => site.scores.overall_score)),
  };

  writeJson(PROVENANCE, {
    step: "05 - maturity score",
    generated_on: today(),
    input: { file: rel(MEASUREMENTS.file), rows: sites.length },
    output: { file: rel(OUTPUT), rows: sites.length },
    summary,
    weights_source: {
      header: "derived in proportion to the penalties published by Mozilla HTTP Observatory",
      tls: "derived from the level definitions in Mozilla Server Side TLS",
      overall: "50/50 - a CHOSEN weight, not a derived one",
    },
    null_policy:
      "an item we could not measure does not score zero; its weight leaves the denominator, and covered_weight reports the coverage.",
  });

  console.log(`  scored ${num(sites.length)} sites`);
  for (const [name, stats] of Object.entries(summary)) {
    console.log(`    ${name.padEnd(14)} median ${stats.median}  mean ${stats.mean}`);
  }
  console.log(`  wrote ${rel(OUTPUT)}`);

  return sites;
}

export function readMeasurements(): Measurement[] {
  return fs
    .readFileSync(MEASUREMENTS.file, "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Measurement);
}
