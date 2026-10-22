import fs from "node:fs";
import path from "node:path";
import { MIN_GROUP_N, type CategoricalComparison, type Comparison } from "./analysis.ts";
import type { Descriptives, GroupTests } from "./steps/06-analyze.ts";
import type { ScoredSite } from "./steps/05-score.ts";

const SIZE_STRATA = ["A_buyuk", "B_orta", "C_kucuk"];

const fixed = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "-" : value.toFixed(digits);

export function writeReport(
  file: string,
  descriptives: Descriptives,
  tests: GroupTests,
  sites: ScoredSite[],
): void {
  const lines: string[] = [];
  const write = (text = "") => lines.push(text);
  const blocked = sites.filter((site) => site.measurement["bot_blocked_observed"]).length;

  write("# Analysis results\n");
  write("> Written by `src/steps/06-analyze.ts`. Do not edit by hand.");
  write(`> Source: \`${descriptives.source}\`, n=${descriptives.n_total} sites\n`);

  write("## 1. Descriptive results\n");
  write("Each row has its own denominator: records that could not be measured are left out.\n");
  write("| Metric | Rate | n | Denominator |");
  write("|---|---|---|---|");
  for (const metric of Object.values(descriptives.binary_metrics)) {
    const value = metric.pct === null ? "not measured" : `${fixed(metric.pct)}%`;
    write(`| ${metric.label} | ${value} | ${metric.pct === null ? 0 : metric.n} | ${metric.denominator} |`);
  }
  write();

  write("### Cookie flags\n");
  write(
    `${descriptives.cookies.sites_setting} sites set ` +
      `${descriptives.cookies.cookies_observed} cookies on the landing page.\n`,
  );
  write("| Flag | Per cookie | n | Per site mean |");
  write("|---|---|---|---|");
  for (const [name, key] of [["Secure", "secure"], ["HttpOnly", "httponly"]] as const) {
    const flag = descriptives.cookies.per_cookie[key];
    write(
      `| ${name} | ${fixed(flag.pct)}% | ${flag.n} | ` +
        `${fixed(descriptives.cookies.per_site_mean[key])}% |`,
    );
  }
  for (const [value, flag] of Object.entries(descriptives.cookies.per_cookie.samesite)) {
    write(`| SameSite ${value} | ${fixed(flag.pct)}% | ${flag.n} | |`);
  }
  write();

  write("### Secondary metrics\n");
  write("Reported for completeness. These are not part of the group comparison family.\n");
  write("| Metric | Rate | n | Denominator |");
  write("|---|---|---|---|");
  for (const metric of Object.values(descriptives.secondary_metrics)) {
    const value = metric.pct === null ? "not measured" : `${fixed(metric.pct)}%`;
    write(`| ${metric.label} | ${value} | ${metric.pct === null ? 0 : metric.n} | ${metric.denominator} |`);
  }
  write();
  write(
    `CSP directive count, over the ${descriptives.csp_directive_count.n} sites sending a policy: ` +
      `median ${fixed(descriptives.csp_directive_count.median)}, ` +
      `mean ${fixed(descriptives.csp_directive_count.mean)}, ` +
      `max ${fixed(descriptives.csp_directive_count.max)}.`,
  );
  write(`Plain HTTP subresources found in the landing pages: ${descriptives.mixed_content_references}.\n`);

  write("### Maturity scores\n");
  write("| Score | n | Mean | Median | SD | Min | Max |");
  write("|---|---|---|---|---|---|---|");
  for (const [name, stats] of Object.entries(descriptives.scores)) {
    write(
      `| ${name} | ${stats.n} | ${fixed(stats.mean)} | ${fixed(stats.median)} | ` +
        `${fixed(stats.sd)} | ${fixed(stats.min)} | ${fixed(stats.max)} |`,
    );
  }
  write();

  write("## 2. By size stratum (RQ4)\n");
  write(`\`D_botduvari\` is **left out** of this comparison: ${tests.note}\n`);
  write("| Stratum | n | overall_score median | Q1-Q3 | In the test |");
  write("|---|---|---|---|---|");
  for (const [name, stats] of Object.entries(descriptives.scores_by_stratum["overall_score"] ?? {})) {
    if (!stats.n) continue;
    const included = SIZE_STRATA.includes(name) ? "yes" : "**no** (shown for reference)";
    write(
      `| ${name} | ${stats.n} | ${fixed(stats.median)} | ` +
        `${fixed(stats.q1)}-${fixed(stats.q3)} | ${included} |`,
    );
  }
  write();
  writeFamily(write, tests.families.scores_by_size);

  write("## 3. By sector (RQ4)\n");
  write("| Sector | n | overall_score median | Q1-Q3 |");
  write("|---|---|---|---|");
  const bySector = Object.entries(descriptives.scores_by_sector["overall_score"] ?? {}).sort(
    (a, b) => (b[1].n ?? 0) - (a[1].n ?? 0),
  );
  for (const [name, stats] of bySector) {
    if (!stats.n) continue;
    write(`| ${name} | ${stats.n} | ${fixed(stats.median)} | ${fixed(stats.q1)}-${fixed(stats.q3)} |`);
  }
  write();
  writeFamily(write, tests.families.scores_by_sector);

  write("## 4. Kategorik testler\n");
  for (const key of ["headers_by_size", "headers_by_sector"] as const) {
    const group = tests.families[key];
    write(`### ${group.description}\n`);
    write("| Metric | Test | p (raw) | p (Holm) | Effect (Cramer's V) | Result |");
    write("|---|---|---|---|---|---|");

    const unreliable: Array<[string, string]> = [];
    for (const [metric, result] of Object.entries(group.results)) {
      const holm = group.holm[metric];
      const effect = result.effect_size;
      let verdict = "not significant";

      if (result.reliable === false) {
        verdict = "**not reliable**";
        unreliable.push([metric, result.warning ?? ""]);
      } else if (holm?.significant_adjusted) {
        verdict = "significant";
      }

      write(
        `| ${metric} | ${result.test ?? "-"} | ${fixed(result.p, 4)} | ` +
          `${fixed(holm?.p_adjusted, 4)} | ${effect?.value} (${effect?.interpretation}) | ${verdict} |`,
      );
    }
    write();

    if (unreliable.length > 0) {
      write("**Tests that are not reliable.** The p-value is shown for information only;");
      write("no decision about significance was made:\n");
      for (const [metric, why] of unreliable) write(`- \`${metric}\`: ${why}`);
      write();
    }
  }

  write("## 5. Sensitivity check: bot walls\n");
  write(`A bot wall was seen on **${blocked}** sites. On those sites the headers may come from`);
  write("the firewall response rather than the origin, whose real settings may differ.\n");
  writeFamily(write, tests.families.sensitivity_bot_wall);

  write("### Rates with those sites removed\n");
  write("| Metric | All sites | Bot walls removed |");
  write("|---|---|---|");
  for (const [name, metric] of Object.entries(descriptives.binary_metrics)) {
    const excluded = tests.sensitivity_ratios_excluding_blocked[name];
    if (!excluded || metric.pct === null || excluded.pct === null) continue;
    write(
      `| ${metric.label} | %${fixed(metric.pct)} (n=${metric.n}) | ` +
        `%${fixed(excluded.pct)} (n=${excluded.n}) |`,
    );
  }
  write();

  write("## 6. Notes on method\n");
  write("- Normality was checked with Shapiro-Wilk. The score distributions were not");
  write("  normal, so non-parametric tests were used.");
  write("- Two groups: Mann-Whitney U, effect size rank-biserial *r*.");
  write("- Three or more groups: Kruskal-Wallis H, effect size epsilon-squared.");
  write("- Categorical: chi-square, and Fisher exact for 2x2 tables with an expected");
  write("  frequency below 5. Effect size Cramer's V.");
  write("- Holm-Bonferroni correction was applied within each family of tests. Both raw");
  write("  and adjusted p-values are reported.");
  write(`- Groups with n<${MIN_GROUP_N} were not tested, and that is stated in the report.`);
  write("- **Weighting.** The strata were sampled with different probabilities");
  write("  (A 0.1822, B 0.2464, C 0.2261, D 1.0). The rates here are **unweighted**.");
  write("  To estimate a population rate, apply the stratum weights.");

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n"), "utf-8");
}

function writeFamily(
  write: (text?: string) => void,
  group: { results: Record<string, Comparison | CategoricalComparison>; holm: Record<string, { p_adjusted: number | null } | undefined> },
): void {
  write("| Variable | Test | Statistic | p (raw) | p (Holm) | Effect size |");
  write("|---|---|---|---|---|---|");

  for (const [name, result] of Object.entries(group.results)) {
    const holm = group.holm[name];
    const effect = result.effect_size;
    write(
      `| ${name} | ${result.test ?? "not run"} | ${fixed(result.statistic, 3)} | ` +
        `${fixed(result.p, 4)} | ${fixed(holm?.p_adjusted, 4)} | ` +
        `${effect?.name ?? "-"} = ${effect?.value} (${effect?.interpretation}) |`,
    );
  }
  write();
}
