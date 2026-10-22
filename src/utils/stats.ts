import {
  chiSquareSurvival,
  hypergeometricPmf,
  normalCdf,
  normalQuantile,
  normalSurvival,
} from "./distributions.ts";
import { round } from "./round.ts";

export const ALPHA = 0.05;

export type Describe = {
  n: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
};

export function describe(values: Array<number | null>): Describe {
  const clean = values.filter((value): value is number => value !== null);
  if (clean.length === 0) {
    return { n: 0, mean: null, median: null, sd: null, min: null, max: null, q1: null, q3: null };
  }

  const sorted = [...clean].sort((a, b) => a - b);
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance =
    clean.length > 1
      ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1)
      : null;

  return {
    n: clean.length,
    mean: round(mean, 2),
    median: round(percentile(sorted, 50), 2),
    sd: variance === null ? null : round(Math.sqrt(variance), 2),
    min: round(sorted[0]!, 2),
    max: round(sorted[sorted.length - 1]!, 2),
    q1: round(percentile(sorted, 25), 2),
    q3: round(percentile(sorted, 75), 2),
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;

  const position = ((sorted.length - 1) * p) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

const SHAPIRO_C1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
const SHAPIRO_C2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
const SHAPIRO_C3 = [0.544, -0.39978, 0.025054, -6.714e-4];
const SHAPIRO_C4 = [1.3822, -0.77857, 0.062767, -0.0020322];
const SHAPIRO_C5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
const SHAPIRO_C6 = [-0.4803, -0.082676, 0.0030302];
const SHAPIRO_G = [-2.273, 0.459];

const horner = (coefficients: number[], x: number) =>
  coefficients.reduceRight((sum, coefficient) => sum * x + coefficient, 0);

export type Normality = {
  test: "shapiro";
  n: number;
  statistic?: number;
  p: number | null;
  normal: boolean | null;
  note?: string;
};

export function normality(values: Array<number | null>): Normality {
  const clean = values.filter((value): value is number => value !== null);

  if (clean.length < 3) {
    return { test: "shapiro", n: clean.length, p: null, normal: null, note: "n<3, normality cannot be assessed" };
  }
  if (new Set(clean).size === 1) {
    return {
      test: "shapiro",
      n: clean.length,
      p: null,
      normal: false,
      note: "all values are the same (zero variance), so normality is undefined",
    };
  }

  const x = [...clean].sort((a, b) => a - b);
  const n = x.length;
  const half = Math.floor(n / 2);

  const a = new Array<number>(half).fill(0);
  let sumSquares = 0;

  if (n === 3) {
    a[0] = Math.SQRT1_2;
    sumSquares = 1;
  } else {
    for (let i = 0; i < half; i++) {
      a[i] = normalQuantile((i + 1 - 0.375) / (n + 0.25));
      sumSquares += a[i]! ** 2;
    }
    sumSquares *= 2;

    const root = Math.sqrt(sumSquares);
    const rsn = 1 / Math.sqrt(n);
    const a1 = horner(SHAPIRO_C1, rsn) - a[0]! / root;

    let factor: number;

    if (n > 5) {
      const a2 = horner(SHAPIRO_C2, rsn) - a[1]! / root;
      factor = Math.sqrt(
        (sumSquares - 2 * a[0]! ** 2 - 2 * a[1]! ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2),
      );
      for (let i = 2; i < half; i++) a[i] = -a[i]! / factor;
      a[1] = a2;
    } else {
      factor = Math.sqrt((sumSquares - 2 * a[0]! ** 2) / (1 - 2 * a1 ** 2));
      for (let i = 1; i < half; i++) a[i] = -a[i]! / factor;
    }
    a[0] = a1;
  }

  const mean = x.reduce((sum, value) => sum + value, 0) / n;
  const spread = x.reduce((sum, value) => sum + (value - mean) ** 2, 0);

  let weighted = 0;
  for (let i = 0; i < half; i++) weighted += a[i]! * (x[n - 1 - i]! - x[i]!);

  const w = Math.min(1, (weighted * weighted) / spread);
  const p = shapiroPValue(w, n);

  return { test: "shapiro", n, statistic: round(w, 4), p, normal: p === null ? null : p > ALPHA };
}

function shapiroPValue(w: number, n: number): number | null {
  if (n === 3) {
    const pi6 = 1.90985931710274;
    const stqr = 1.04719755119660;
    return Math.max(0, Math.min(1, pi6 * (Math.asin(Math.sqrt(w)) - stqr)));
  }
  if (w >= 1) return 1;

  if (n <= 11) {
    const gamma = horner(SHAPIRO_G, n);
    if (gamma - Math.log(1 - w) <= 0) return 0;

    const y = -Math.log(gamma - Math.log(1 - w));
    return normalSurvival((y - horner(SHAPIRO_C3, n)) / Math.exp(horner(SHAPIRO_C4, n)));
  }

  const logN = Math.log(n);
  const y = Math.log(1 - w);
  return normalSurvival((y - horner(SHAPIRO_C5, logN)) / Math.exp(horner(SHAPIRO_C6, logN)));
}

function ranks(values: number[]): { ranks: number[]; tieTerm: number } {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let tieTerm = 0;

  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++;

    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) result[order[k]!.index] = averageRank;

    const tied = j - i + 1;
    if (tied > 1) tieTerm += tied ** 3 - tied;
    i = j + 1;
  }
  return { ranks: result, tieTerm };
}

export type MannWhitney = { statistic: number; p: number; rankBiserial: number };

export function mannWhitneyU(a: number[], b: number[]): MannWhitney {
  const combined = [...a, ...b];
  const { ranks: rankValues, tieTerm } = ranks(combined);

  const rankSumA = rankValues.slice(0, a.length).reduce((sum, rank) => sum + rank, 0);
  const u1 = rankSumA - (a.length * (a.length + 1)) / 2;
  const u2 = a.length * b.length - u1;

  const n = a.length + b.length;
  const mu = (a.length * b.length) / 2;
  const sd = Math.sqrt(((a.length * b.length) / 12) * (n + 1 - tieTerm / (n * (n - 1))));

  const z = (Math.max(u1, u2) - mu - 0.5) / sd;
  const p = Math.min(1, 2 * normalSurvival(z));

  return { statistic: u1, p, rankBiserial: (2 * u1) / (a.length * b.length) - 1 };
}

export type KruskalWallis = { statistic: number; df: number; p: number };

export function kruskalWallis(groups: number[][]): KruskalWallis {
  const combined = groups.flat();
  const { ranks: rankValues, tieTerm } = ranks(combined);
  const n = combined.length;

  let offset = 0;
  let total = 0;
  for (const group of groups) {
    const rankSum = rankValues.slice(offset, offset + group.length).reduce((sum, r) => sum + r, 0);
    total += rankSum ** 2 / group.length;
    offset += group.length;
  }

  const h = ((12 / (n * (n + 1))) * total - 3 * (n + 1)) / (1 - tieTerm / (n ** 3 - n));
  const df = groups.length - 1;

  return { statistic: h, df, p: chiSquareSurvival(h, df) };
}

export type ChiSquare = {
  statistic: number;
  df: number;
  p: number;
  expected: number[][];
};

export function chiSquareTest(observed: number[][]): ChiSquare {
  const rowTotals = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals = observed[0]!.map((_, column) =>
    observed.reduce((sum, row) => sum + row[column]!, 0),
  );
  const total = rowTotals.reduce((a, b) => a + b, 0);

  const expected = rowTotals.map((rowTotal) =>
    colTotals.map((colTotal) => (rowTotal * colTotal) / total),
  );

  const df = (observed.length - 1) * (observed[0]!.length - 1);
  const correction = df === 1 ? 0.5 : 0;

  let statistic = 0;
  for (let i = 0; i < observed.length; i++) {
    for (let j = 0; j < observed[i]!.length; j++) {
      const difference = Math.max(0, Math.abs(observed[i]![j]! - expected[i]![j]!) - correction);
      statistic += difference ** 2 / expected[i]![j]!;
    }
  }

  return { statistic, df, p: chiSquareSurvival(statistic, df), expected };
}

export type FisherExact = { oddsRatio: number; p: number };

export function fisherExact(table: number[][]): FisherExact {
  const [[a, b], [c, d]] = table as [[number, number], [number, number]];

  const rowOne = a + b;
  const rowTwo = c + d;
  const columnOne = a + c;
  const total = rowOne + rowTwo;

  if (rowOne === 0 || rowTwo === 0 || columnOne === 0 || b + d === 0) {
    return { oddsRatio: Number.NaN, p: 1 };
  }

  const oddsRatio = c > 0 && b > 0 ? (a * d) / (c * b) : Infinity;
  const pmf = (x: number) => hypergeometricPmf(x, total, rowOne, columnOne);

  const mode = Math.floor(((columnOne + 1) * (rowOne + 1)) / (total + 2));
  const observed = pmf(a);
  const atMode = pmf(mode);

  const epsilon = 1e-14;
  if (Math.abs(observed - atMode) / Math.max(observed, atMode) <= epsilon) {
    return { oddsRatio, p: 1 };
  }

  const gamma = 1 + epsilon;
  const cdf = (x: number) => sumPmf(pmf, 0, x);
  const sf = (x: number) => sumPmf(pmf, x + 1, columnOne);

  if (a < mode) {
    const lower = cdf(a);
    if (pmf(columnOne) > observed * gamma) return { oddsRatio, p: Math.min(1, lower) };

    const guess = binarySearch((x) => -pmf(x), -observed * gamma, mode, columnOne);
    return { oddsRatio, p: Math.min(1, lower + sf(guess)) };
  }

  const upper = sf(a - 1);
  if (pmf(0) > observed * gamma) return { oddsRatio, p: Math.min(1, upper) };

  const guess = binarySearch(pmf, observed * gamma, 0, mode);
  return { oddsRatio, p: Math.min(1, upper + cdf(guess)) };
}

function sumPmf(pmf: (x: number) => number, from: number, to: number): number {
  let sum = 0;
  for (let x = Math.max(0, from); x <= to; x++) sum += pmf(x);
  return sum;
}

function binarySearch(a: (x: number) => number, target: number, low: number, high: number): number {
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const value = a(middle);

    if (value < target) low = middle + 1;
    else if (value > target) high = middle - 1;
    else return middle;
  }
  return a(low) <= target ? low : low - 1;
}

export type Adjusted = {
  p_raw: number | null;
  p_adjusted: number | null;
  significant_adjusted: boolean | null;
};

export function holmBonferroni(pValues: Record<string, number | null>): Record<string, Adjusted> {
  const present = Object.entries(pValues)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .sort((x, y) => x[1] - y[1]);

  const result: Record<string, Adjusted> = {};
  let previous = 0;

  present.forEach(([key, p], index) => {
    const adjusted = Math.min(1, Math.max(previous, (present.length - index) * p));
    previous = adjusted;
    result[key] = {
      p_raw: p,
      p_adjusted: round(adjusted, 5),
      significant_adjusted: adjusted < ALPHA,
    };
  });

  for (const [key, value] of Object.entries(pValues)) {
    if (value === null) result[key] = { p_raw: null, p_adjusted: null, significant_adjusted: null };
  }
  return result;
}

export function wilsonInterval(hits: number, n: number, confidence = 0.95) {
  if (n === 0) return { low: null, high: null };

  const z = normalQuantile(1 - (1 - confidence) / 2);
  const proportion = hits / n;
  const denominator = 1 + z ** 2 / n;
  const center = (proportion + z ** 2 / (2 * n)) / denominator;
  const margin =
    (z * Math.sqrt((proportion * (1 - proportion)) / n + z ** 2 / (4 * n ** 2))) / denominator;

  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export const effectSizeLabel = {
  r: (value: number) => bucket(Math.abs(value), [0.5, 0.3, 0.1]),
  epsilonSquared: (value: number) => bucket(value, [0.14, 0.06, 0.01]),
  cramersV: (value: number) => bucket(value, [0.5, 0.3, 0.1]),
};

function bucket(value: number, [large, medium, small]: number[]): string {
  if (value >= large!) return "large";
  if (value >= medium!) return "medium";
  if (value >= small!) return "small";
  return "negligible";
}
