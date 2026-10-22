import fs from "node:fs";
import path from "node:path";
import { readLines } from "./utils/csv.ts";
import { ALL_DATASETS, type Dataset } from "./datasets.ts";
import { readJson, sha256 } from "./utils/files.ts";
import { num } from "./utils/format.ts";
import { EXPECTED } from "./utils/paths.ts";

const FINGERPRINTS = path.join(EXPECTED, "outputs.json");

type Fingerprints = {
  outputs: Record<string, { rows: number; sha256: string }>;
};

export async function matchesExpected(file: string): Promise<boolean> {
  const expected = readJson<Fingerprints>(FINGERPRINTS).outputs[path.basename(file)];
  if (!expected) return true;

  return (await sha256(file)) === expected.sha256;
}

export async function verifyOutputs(files: string[]): Promise<boolean> {
  const problems: string[] = [];

  console.log("  source data");
  for (const dataset of ALL_DATASETS) {
    problems.push(...(await checkDataset(dataset)));
  }

  console.log("  output");
  const expected = readJson<Fingerprints>(FINGERPRINTS).outputs;
  for (const file of files) {
    problems.push(...(await checkOutput(file, expected)));
  }

  return problems.length === 0;
}

async function checkDataset(dataset: Dataset): Promise<string[]> {
  const name = path.basename(dataset.file);

  if (!fs.existsSync(dataset.file)) {
    if (dataset.fetchElsewhere) {
      console.log(`    absent   ${name}: published by others, fetch it from its permanent address`);
      return [];
    }
    console.log(`    MISSING  ${name}`);
    return [name];
  }

  const actual = await sha256(dataset.file);
  if (actual === dataset.sha256) {
    console.log(`    ok       ${name}`);
    return [];
  }

  console.log(`    CHANGED  ${name}: the source data is not the same`);
  console.log(`             expected ${dataset.sha256}`);
  console.log(`             found    ${actual}`);
  return [name];
}

async function checkOutput(
  file: string,
  expected: Fingerprints["outputs"],
): Promise<string[]> {
  const name = path.basename(file);
  const want = expected[name];

  if (!want) {
    console.log(`    skipped  ${name}: not listed in expected/outputs.json`);
    return [];
  }

  const [rows, actual] = await Promise.all([countRows(file), sha256(file)]);

  if (actual === want.sha256) {
    console.log(`    ok       ${name}, ${num(rows)} rows`);
    return [];
  }

  const detail =
    rows === want.rows
      ? `the row count is right (${num(rows)}) but the content differs`
      : `${num(rows)} satir, beklenen ${num(want.rows)}`;

  console.log(`    CHANGED  ${name}: ${detail}`);
  return [name];
}

async function countRows(file: string): Promise<number> {
  let lines = 0;
  for await (const line of readLines(file)) {
    void line;
    lines++;
  }
  return lines - 1;
}

const ANALYSIS_TOLERANCE = 1e-6;

export function compareAnalysis(files: string[]): boolean {
  let allOk = true;

  for (const file of files) {
    const name = path.basename(file);
    const reference = path.join(EXPECTED, "analysis", name);

    if (!fs.existsSync(reference) || !fs.existsSync(file)) {
      console.log(`    skipped  ${name}`);
      continue;
    }

    const differences = compareValues(
      readJson<unknown>(reference),
      readJson<unknown>(file),
      "",
      [],
    );

    if (differences.length === 0) {
      console.log(`    ok       ${name}`);
      continue;
    }

    allOk = false;
    console.log(`    CHANGED  ${name}: ${num(differences.length)} fields`);
    for (const difference of differences.slice(0, 5)) console.log(`             ${difference}`);
  }

  return allOk;
}

const IGNORED_KEYS = new Set(["source", "generated_on", "note"]);

function compareValues(expected: unknown, actual: unknown, at: string, found: string[]): string[] {
  if (isRecord(expected) && isRecord(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (IGNORED_KEYS.has(key)) continue;
      compareValues(expected[key], actual[key], `${at}/${key}`, found);
    }
    return found;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      found.push(`${at}: expected a length of ${expected.length}, got ${actual.length}`);
      return found;
    }
    expected.forEach((value, index) => compareValues(value, actual[index], `${at}[${index}]`, found));
    return found;
  }

  if (typeof expected === "number" && typeof actual === "number") {
    const scale = Math.max(Math.abs(expected), Math.abs(actual), Number.MIN_VALUE);
    if (Math.abs(expected - actual) / scale > ANALYSIS_TOLERANCE) {
      found.push(`${at}: expected ${expected}, got ${actual}`);
    }
    return found;
  }

  if (expected !== actual) found.push(`${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
