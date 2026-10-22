import {
  ALPHA,
  chiSquareTest,
  describe,
  effectSizeLabel,
  fisherExact,
  kruskalWallis,
  mannWhitneyU,
  normality,
  type Describe,
  type Normality,
} from "./utils/stats.ts";
import { round } from "./utils/round.ts";

export const MIN_GROUP_N = 5;
const MIN_CATEGORY_TOTAL = 10;

type Values = Array<number | null>;

export type EffectSize = {
  name: string;
  value: number | null;
  interpretation: string | null;
  value_unclamped?: number;
  note?: string | null;
};

export type Comparison = {
  groups?: string[];
  descriptives: Record<string, Describe>;
  normality: Record<string, Normality>;
  groups_tested?: string[];
  groups_excluded_small?: string[];
  test: string | null;
  statistic?: number;
  df?: number;
  p?: number;
  significant?: boolean;
  effect_size?: EffectSize;
  note?: string;
};

const clean = (values: Values) => values.filter((value): value is number => value !== null);

export function compareTwo(a: Values, b: Values, labelA = "A", labelB = "B"): Comparison {
  const first = clean(a);
  const second = clean(b);

  const base: Comparison = {
    groups: [labelA, labelB],
    descriptives: { [labelA]: describe(first), [labelB]: describe(second) },
    normality: { [labelA]: normality(first), [labelB]: normality(second) },
    test: null,
  };

  if (first.length < MIN_GROUP_N || second.length < MIN_GROUP_N) {
    return { ...base, note: `a group has n<${MIN_GROUP_N}, so no test was run` };
  }

  const result = mannWhitneyU(first, second);
  return {
    ...base,
    test: "Mann-Whitney U",
    statistic: result.statistic,
    p: result.p,
    significant: result.p < ALPHA,
    effect_size: {
      name: "rank-biserial r",
      value: round(result.rankBiserial, 3),
      interpretation: effectSizeLabel.r(result.rankBiserial),
    },
    note: "Normality is not assumed; a non-parametric test was chosen on purpose.",
  };
}

export function compareMany(groups: Record<string, Values>): Comparison {
  const cleaned = Object.fromEntries(Object.entries(groups).map(([key, v]) => [key, clean(v)]));
  const usable = Object.entries(cleaned).filter(([, v]) => v.length >= MIN_GROUP_N);
  const names = usable.map(([key]) => key).sort();

  const base: Comparison = {
    descriptives: Object.fromEntries(Object.entries(cleaned).map(([k, v]) => [k, describe(v)])),
    normality: Object.fromEntries(Object.entries(cleaned).map(([k, v]) => [k, normality(v)])),
    groups_tested: names,
    groups_excluded_small: Object.keys(cleaned).filter((key) => !names.includes(key)).sort(),
    test: null,
  };

  if (names.length < 2) {
    return { ...base, note: `a test needs at least 2 groups, each with n>=${MIN_GROUP_N}` };
  }

  if (names.length === 2) {
    const [first, second] = names as [string, string];
    const { descriptives, normality: _ignored, ...rest } = compareTwo(
      cleaned[first]!,
      cleaned[second]!,
      first,
      second,
    );
    void descriptives;
    void _ignored;
    return { ...base, ...rest };
  }

  const ordered = names.map((name) => cleaned[name]!);
  const result = kruskalWallis(ordered);
  const n = ordered.reduce((sum, group) => sum + group.length, 0);
  const k = ordered.length;

  const raw = n > k ? (result.statistic - k + 1) / (n - k) : null;
  const clamped = raw === null ? null : Math.max(0, raw);

  return {
    ...base,
    test: "Kruskal-Wallis H",
    statistic: result.statistic,
    df: result.df,
    p: result.p,
    significant: result.p < ALPHA,
    effect_size: {
      name: "epsilon-squared",
      value: clamped === null ? null : round(clamped, 3),
      value_unclamped: raw === null ? undefined : round(raw, 4),
      interpretation: clamped === null ? null : effectSizeLabel.epsilonSquared(clamped),
      note:
        raw !== null && raw < 0 ? "the raw value was negative because H < k-1, so it was clamped to 0" : null,
    },
  };
}

export type CategoricalComparison = {
  groups: string[];
  categories: string[];
  observed: number[][];
  test: string | null;
  statistic?: number;
  df?: number;
  p?: number;
  odds_ratio?: number;
  significant?: boolean | null;
  expected_cells_below_5?: number;
  expected_cells_below_1?: number;
  total_cells?: number;
  rarest_category_total?: number;
  reliable?: boolean;
  warning?: string;
  effect_size?: EffectSize;
  note?: string;
};

export function compareCategorical(
  table: Record<string, Record<string, number>>,
  categoryOrder?: string[],
): CategoricalComparison {
  const groups = Object.keys(table).sort();
  const found = new Set(Object.values(table).flatMap((row) => Object.keys(row)));
  const categories = categoryOrder
    ? categoryOrder.filter((category) => found.has(category))
    : [...found].sort();
  const observed = groups.map((group) => categories.map((category) => table[group]?.[category] ?? 0));

  const total = observed.flat().reduce((a, b) => a + b, 0);
  const base: CategoricalComparison = { groups, categories, observed, test: null };

  if (total === 0 || observed.length < 2 || categories.length < 2) {
    return { ...base, note: "the table is too small to test" };
  }

  const { statistic, df, p, expected } = chiSquareTest(observed);
  const flatExpected = expected.flat();
  const below5 = flatExpected.filter((value) => value < 5).length;
  const below1 = flatExpected.filter((value) => value < 1).length;
  const columnTotals = categories.map((_, index) =>
    observed.reduce((sum, row) => sum + row[index]!, 0),
  );
  const rarest = Math.min(...columnTotals);

  const cochranOk = below1 === 0 && below5 <= 0.2 * flatExpected.length;
  const sparse = rarest < MIN_CATEGORY_TOTAL;
  const reliable = cochranOk && !sparse;

  const result: CategoricalComparison = {
    ...base,
    expected_cells_below_5: below5,
    expected_cells_below_1: below1,
    total_cells: flatExpected.length,
    rarest_category_total: rarest,
    reliable,
  };

  const isTwoByTwo = observed.length === 2 && categories.length === 2;
  if (isTwoByTwo && below5 > 0) {
    const fisher = fisherExact(observed);
    result.test = "Fisher exact (a cell has expected <5)";
    result.p = fisher.p;
    result.odds_ratio = round(fisher.oddsRatio, 3);
    result.significant = sparse ? null : fisher.p < ALPHA;
  } else {
    result.test = "Chi-square";
    result.statistic = statistic;
    result.df = df;
    result.p = p;
    result.significant = reliable ? p < ALPHA : null;
  }

  const reasons: string[] = [];
  if (below1) reasons.push(`expected frequency below 1 in ${below1} cells`);
  if (below5 > 0.2 * flatExpected.length) {
    reasons.push(
      `expected frequency below 5 in ${below5}/${flatExpected.length} cells (over the Cochran limit)`,
    );
  }
  if (sparse) {
    reasons.push(`the rarest category has only ${rarest} observations (<${MIN_CATEGORY_TOTAL})`);
  }

  if (reasons.length > 0) {
    result.warning =
      `NOT RELIABLE: ${reasons.join("; ")}. The p-value is shown for information only; ` +
      "no decision about significance was made.";
  } else if (below5) {
    result.warning =
      `expected frequency below 5 in ${below5}/${flatExpected.length} cells, within the Cochran ` +
      "limit but read with care";
  }

  const minDimension = Math.min(observed.length, categories.length) - 1;
  const v = total && minDimension ? Math.sqrt(statistic / (total * minDimension)) : null;
  result.effect_size = {
    name: "Cramer's V",
    value: v === null ? null : round(v, 3),
    interpretation: v === null ? null : effectSizeLabel.cramersV(v),
  };

  return result;
}
