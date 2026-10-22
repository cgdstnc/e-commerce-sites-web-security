import { num } from "./utils/format.ts";
import { OUT, RAW, rel } from "./utils/paths.ts";
import { trancoSlice, OUTPUT as TRANCO_SLICE_FILE } from "./steps/01-tranco-slice.ts";
import { mergeCrux, OUTPUT as CANDIDATE_FRAME_FILE } from "./steps/02-merge-crux.ts";
import { prefilter, OUTPUT as CRAWL_LIST_FILE } from "./steps/03a-prefilter.ts";
import { auditRequestLogs, classifyDomains } from "./steps/03b-classify.ts";
import { measureSites } from "./steps/04-measure.ts";
import { pool, POOL } from "./steps/03c-pool.ts";
import { finalizeFrame, OUTPUT as SAMPLE_FRAME } from "./steps/03h-finalize.ts";
import { scoreSites, OUTPUT as SCORES } from "./steps/05-score.ts";
import { analyze, DESCRIPTIVES, GROUP_TESTS } from "./steps/06-analyze.ts";
import { compareAnalysis, verifyOutputs } from "./verify.ts";

const args = process.argv.slice(2);
const wants = (flag: string) => args.includes(flag);

const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8)) || undefined;

console.log(`\nraw data : ${rel(RAW)}`);
console.log(`output   : ${rel(OUT)}\n`);

if (wants("--audit")) {
  console.log("[03b] ethical compliance audit");
  auditRequestLogs();
  console.log("");
  process.exit(0);
}

const skipFrame = wants("--skip-frame");
let frameCounts = "";

if (!skipFrame) {
  console.log("[01] Tranco .tr slice");
  const trancoRows = await trancoSlice();

  console.log("\n[02] merge with the Chrome UX Report list for Turkiye");
  const candidateFrame = await mergeCrux(trancoRows);

  console.log("\n[03a] prefilter and stratified sample");
  const crawlList = prefilter(candidateFrame);

  frameCounts =
    `${num(trancoRows.length)} .tr -> ${num(candidateFrame.length)} candidates -> ` +
    `${num(crawlList.length)} crawled -> `;
  console.log("");
}

console.log("[03c] candidate pool and draft sample");
const candidatePool = pool();

console.log("\n[03h] final sampling frame");
const sampleFrame = await finalizeFrame();

console.log("\n[05] maturity score");
const scored = scoreSites();

console.log("\n[06] analysis");
analyze(scored);

console.log(
  `\n${frameCounts}${num(candidatePool.length)} in the pool -> ` +
    `${num(sampleFrame.length)} sites -> ${num(scored.length)} measured\n`,
);

if (wants("--verify")) {
  console.log("Verification");
  const frameFiles = [TRANCO_SLICE_FILE, CANDIDATE_FRAME_FILE, CRAWL_LIST_FILE];
  const ok = await verifyOutputs([...(skipFrame ? [] : frameFiles), POOL, SAMPLE_FRAME, SCORES]);

  console.log("  analysis");
  const analysisOk = compareAnalysis([DESCRIPTIVES, GROUP_TESTS]);

  if (!ok || !analysisOk) {
    console.log("\nVERIFICATION FAILED: output differs from what was expected\n");
    process.exit(1);
  }
  console.log("\nall checks passed\n");
}

for (const [flag, label, run] of [
  ["03b", "Passive classification crawl", classifyDomains],
  ["04", "Security measurement", measureSites],
] as const) {
  if (!wants(flag)) continue;

  console.log(`[${flag}] ${label}`);
  try {
    await run(limit);
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  console.log("");
}
