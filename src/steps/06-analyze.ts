import path from "node:path";
import {
  compareCategorical,
  compareMany,
  compareTwo,
  MIN_GROUP_N,
  type CategoricalComparison,
  type Comparison,
} from "../analysis.ts";
import { MEASUREMENTS } from "../datasets.ts";
import type { ScoredSite } from "./05-score.ts";
import { writeJson } from "../utils/files.ts";
import { num, today } from "../utils/format.ts";
import { OUT, rel } from "../utils/paths.ts";
import { describe, holmBonferroni } from "../utils/stats.ts";
import { round } from "../utils/round.ts";
import { writeReport } from "../report.ts";

export const DESCRIPTIVES = path.join(OUT, "descriptives.json");
export const GROUP_TESTS = path.join(OUT, "group_tests.json");
export const REPORT = path.join(OUT, "ANALYSIS.md");

const SIZE_STRATA = ["A_buyuk", "B_orta", "C_kucuk"];
const SCORE_FIELDS = ["header_score", "tls_score", "overall_score"] as const;
const LEGACY_TLS = ["TLSv1.0", "TLSv1.1"];
const CATEGORY_ORDER = ["present", "absent"];

export const BINARY_METRICS: Array<[string, string, string]> = [
  ["hsts_present", "Sends HSTS", "all measured sites"],
  ["hsts_include_subdomains", "HSTS includeSubDomains", "sites sending HSTS"],
  ["hsts_in_preload_list", "In the HSTS preload list", "all sites"],
  ["csp_present", "Sends CSP", "all sites"],
  ["csp_has_frame_ancestors", "CSP frame-ancestors", "sites sending CSP"],
  ["csp_has_unsafe_inline", "CSP unsafe-inline", "sites defining a script source"],
  ["x_content_type_options", "X-Content-Type-Options nosniff", "all sites"],
  ["referrer_policy_strict", "Strict Referrer-Policy", "sites sending a policy"],
  ["framing_protected", "Framing protected", "all sites"],
  ["http_to_https_redirect", "HTTP to HTTPS redirect", "sites reachable over HTTP"],
  ["tls_cert_valid_now", "Certificate valid", "sites with a TLS handshake"],
  ["tls_cert_hostname_match", "Certificate matches hostname", "sites with a TLS handshake"],
  ["tls_weak_cipher_present", "Accepts a weak cipher", "sites that could be tested"],
  ["security_txt_present", "Has security.txt", "sites where robots allowed it"],
  ["server_header_discloses_version", "Server header leaks a version", "all sites"],
];

type Derived = (site: ScoredSite) => boolean | null;

const headerPresent = (name: string): Derived => (site) => {
  if (!field(site, "reachable")) return null;
  return field(site, "header_names_seen") == null ? null : field(site, name) != null;
};

export const SECONDARY_METRICS: Array<[string, string, string, Derived]> = [
  ["permissions_policy_present", "Sends Permissions-Policy", "all sites", headerPresent("permissions_policy")],
  ["feature_policy_legacy_present", "Sends the legacy Feature-Policy", "all sites", headerPresent("feature_policy_legacy")],
  ["coop_present", "Sends Cross-Origin-Opener-Policy", "all sites", headerPresent("coop")],
  ["corp_present", "Sends Cross-Origin-Resource-Policy", "all sites", headerPresent("corp")],
  ["x_powered_by_present", "Sends X-Powered-By", "all sites", (site) => field(site, "x_powered_by_present") as boolean | null],
  ["csp_has_unsafe_eval", "CSP unsafe-eval", "sites defining a script source", (site) => field(site, "csp_has_unsafe_eval") as boolean | null],
  ["csp_has_nonce", "CSP nonce", "sites defining a script source", (site) => field(site, "csp_has_nonce") as boolean | null],
  ["csp_has_strict_dynamic", "CSP strict-dynamic", "sites defining a script source", (site) => field(site, "csp_has_strict_dynamic") as boolean | null],
  ["permissions_policy_single_directive", "Permissions-Policy naming one directive", "sites sending Permissions-Policy", (site) => {
    const count = field(site, "permissions_policy_count");
    return typeof count === "number" ? count === 1 : null;
  }],
  ["mixed_content", "Loads at least one resource over plain HTTP", "sites with an HTML body", (site) => {
    const count = field(site, "mixed_content_count");
    return typeof count === "number" ? count > 0 : null;
  }],
];

export type Ratio = { pct: number | null; n: number; hits: number };
export type Descriptives = ReturnType<typeof describeAll>;
export type GroupTests = ReturnType<typeof runTests>;

const STRATUM_NOTE =
  "D_botduvari is left out of the size comparison. It is not a size class but a " +
  "group added by hand, because these sites could not be classified from their content, " +
  "and its selection probability is 1.0.";

export function analyze(sites: ScoredSite[]): void {
  const descriptives = describeAll(sites);
  const tests = runTests(sites);

  writeJson(DESCRIPTIVES, descriptives);
  writeJson(GROUP_TESTS, tests);
  writeReport(REPORT, descriptives, tests, sites);

  console.log(`  analysed ${num(sites.length)} sites`);
  console.log(`    HSTS %${descriptives.binary_metrics["hsts_present"]?.pct}`);
  console.log(`    CSP %${descriptives.binary_metrics["csp_present"]?.pct}`);
  console.log(`    TLS 1.0/1.1 %${descriptives.binary_metrics["legacy_tls_offered"]?.pct}`);
  console.log(`    overall score median ${descriptives.scores["overall_score"]?.median}`);
  console.log(`  wrote ${rel(REPORT)}`);
}

function field(site: ScoredSite, name: string): unknown {
  return site.measurement[name];
}

function ratio(sites: ScoredSite[], name: string): Ratio {
  const measured = sites.map((site) => field(site, name)).filter((value) => value != null);
  if (measured.length === 0) return { pct: null, n: 0, hits: 0 };

  const hits = measured.filter(Boolean).length;
  return { pct: round((100 * hits) / measured.length, 1), n: measured.length, hits };
}

function derivedRatio(sites: ScoredSite[], derive: Derived): Ratio {
  const measured = sites.map(derive).filter((value) => value != null);
  if (measured.length === 0) return { pct: null, n: 0, hits: 0 };

  const hits = measured.filter(Boolean).length;
  return { pct: round((100 * hits) / measured.length, 1), n: measured.length, hits };
}

function offersLegacyTls(site: ScoredSite): boolean | null {
  const versions = field(site, "tls_protocol_versions_supported");
  if (!Array.isArray(versions)) return null;
  return versions.some((version) => LEGACY_TLS.includes(version));
}

function groupBy(sites: ScoredSite[], key: string, score: (typeof SCORE_FIELDS)[number]) {
  const groups: Record<string, Array<number | null>> = {};
  for (const site of sites) {
    const name = String(field(site, key) ?? "?");
    (groups[name] ??= []).push(site.scores[score]);
  }
  return groups;
}

function describeAll(sites: ScoredSite[]) {
  const sizeStrata = sites.filter((site) => SIZE_STRATA.includes(String(field(site, "stratum"))));
  const blocked = sites.filter((site) => field(site, "bot_blocked_observed"));

  const binary: Record<string, Ratio & { label: string; denominator: string }> = {};
  for (const [name, label, denominator] of BINARY_METRICS) {
    binary[name] = { ...ratio(sites, name), label, denominator };
  }

  const secondary: Record<string, Ratio & { label: string; denominator: string }> = {};
  for (const [name, label, denominator, derive] of SECONDARY_METRICS) {
    secondary[name] = { ...derivedRatio(sites, derive), label, denominator };
  }

  const settingCookies = sites.filter(
    (site) => typeof field(site, "cookie_count") === "number" && (field(site, "cookie_count") as number) > 0,
  );
  const cookieTotal = settingCookies.reduce((sum, site) => sum + (field(site, "cookie_count") as number), 0);

  const perCookie = (name: string) => {
    const flagged = settingCookies.reduce((sum, site) => {
      const ratio = field(site, name);
      const count = field(site, "cookie_count") as number;
      return sum + (typeof ratio === "number" ? Math.round(ratio * count) : 0);
    }, 0);
    return { pct: round((100 * flagged) / cookieTotal, 1), n: cookieTotal, hits: flagged };
  };

  const perSiteMean = (name: string) => {
    const ratios = settingCookies
      .map((site) => field(site, name))
      .filter((value): value is number => typeof value === "number");
    return round((100 * ratios.reduce((a, b) => a + b, 0)) / ratios.length, 1);
  };

  const sameSite = ["strict", "lax", "none", "absent"].map((key) => {
    const count = settingCookies.reduce((sum, site) => {
      const distribution = (field(site, "cookie_samesite_distribution") ?? {}) as Record<string, number>;
      return sum + (distribution[key] ?? 0);
    }, 0);
    return [key, { pct: round((100 * count) / cookieTotal, 1), n: cookieTotal, hits: count }] as const;
  });

  const cspDirectives = sites
    .map((site) => field(site, "csp_directive_count"))
    .filter((value): value is number => typeof value === "number");

  const mixedContentRefs = sites
    .map((site) => field(site, "mixed_content_count"))
    .filter((value): value is number => typeof value === "number");

  const legacy = sites.map(offersLegacyTls).filter((value) => value !== null);
  binary["legacy_tls_offered"] = {
    pct: legacy.length ? round((100 * legacy.filter(Boolean).length) / legacy.length, 1) : null,
    n: legacy.length,
    hits: legacy.filter(Boolean).length,
    label: "Offers TLS 1.0/1.1",
    denominator: "sites with a TLS handshake",
  };

  const versionCounts: Record<string, number> = {};
  for (const site of sites) {
    const versions = field(site, "tls_protocol_versions_supported");
    if (Array.isArray(versions)) {
      for (const version of versions) versionCounts[version] = (versionCounts[version] ?? 0) + 1;
    }
  }

  return {
    source: rel(MEASUREMENTS.file),
    generated_on: today(),
    n_total: sites.length,
    n_size_strata: sizeStrata.length,
    n_bot_blocked_observed: blocked.length,
    binary_metrics: binary,
    secondary_metrics: secondary,
    cookies: {
      sites_setting: settingCookies.length,
      cookies_observed: cookieTotal,
      per_cookie: {
        secure: perCookie("cookie_secure_ratio"),
        httponly: perCookie("cookie_httponly_ratio"),
        samesite: Object.fromEntries(sameSite),
      },
      per_site_mean: {
        secure: perSiteMean("cookie_secure_ratio"),
        httponly: perSiteMean("cookie_httponly_ratio"),
      },
    },
    csp_directive_count: describe(cspDirectives),
    mixed_content_references: mixedContentRefs.reduce((total, value) => total + value, 0),
    scores: Object.fromEntries(
      SCORE_FIELDS.map((name) => [name, describe(sites.map((site) => site.scores[name]))]),
    ),
    scores_by_stratum: Object.fromEntries(
      SCORE_FIELDS.map((name) => [
        name,
        mapValues(groupBy(sites, "stratum", name), describe),
      ]),
    ),
    scores_by_sector: Object.fromEntries(
      SCORE_FIELDS.map((name) => [name, mapValues(groupBy(sites, "sector", name), describe)]),
    ),
    tls_versions: Object.fromEntries(Object.entries(versionCounts).sort()),
  };
}

function runTests(sites: ScoredSite[]) {
  const sizeStrata = sites.filter((site) => SIZE_STRATA.includes(String(field(site, "stratum"))));
  const blocked = sites.filter((site) => field(site, "bot_blocked_observed"));
  const unblocked = sites.filter((site) => !field(site, "bot_blocked_observed"));

  const scoresByStratum = family(
    "Maturity scores by size stratum (A/B/C)",
    Object.fromEntries(SCORE_FIELDS.map((name) => [name, compareMany(groupBy(sizeStrata, "stratum", name))])),
  );

  const scoresBySector = family(
    "Maturity scores by sector",
    Object.fromEntries(SCORE_FIELDS.map((name) => [name, compareMany(groupBy(sites, "sector", name))])),
  );

  const headersByStratum = family(
    "Header or property present, by size stratum",
    categoricalFamily(sizeStrata, "stratum", false),
  );

  const headersBySector = family(
    `Header or property present, by sector (sectors with n<${MIN_GROUP_N} left out)`,
    categoricalFamily(sites, "sector", true),
  );

  const sensitivity = family(
    "Sites where a bot wall was seen against the rest. On those sites the headers may come from the firewall response.",
    Object.fromEntries(
      SCORE_FIELDS.map((name) => [
        name,
        compareTwo(
          blocked.map((site) => site.scores[name]),
          unblocked.map((site) => site.scores[name]),
          "bot_duvari",
          "normal",
        ),
      ]),
    ),
  );

  return {
    note: STRATUM_NOTE,
    generated_on: today(),
    families: {
      scores_by_size: scoresByStratum,
      scores_by_sector: scoresBySector,
      headers_by_size: headersByStratum,
      headers_by_sector: headersBySector,
      sensitivity_bot_wall: sensitivity,
    },
    sensitivity_ratios_excluding_blocked: Object.fromEntries(
      BINARY_METRICS.map(([name]) => [name, ratio(unblocked, name)]),
    ),
  };
}

function categoricalFamily(sites: ScoredSite[], key: string, dropSmallGroups: boolean) {
  const results: Record<string, CategoricalComparison> = {};

  for (const [name] of BINARY_METRICS) {
    const table: Record<string, Record<string, number>> = {};

    for (const site of sites) {
      const value = field(site, name);
      if (value == null) continue;

      const group = String(field(site, key) ?? "?");
      table[group] ??= {};
      const category = value ? "present" : "absent";
      table[group][category] = (table[group][category] ?? 0) + 1;
    }

    const kept = dropSmallGroups
      ? Object.fromEntries(
          Object.entries(table).filter(
            ([, counts]) => Object.values(counts).reduce((a, b) => a + b, 0) >= MIN_GROUP_N,
          ),
        )
      : table;

    if (Object.keys(kept).length >= 2) results[name] = compareCategorical(kept, CATEGORY_ORDER);
  }
  return results;
}

function family<T extends Comparison | CategoricalComparison>(
  description: string,
  results: Record<string, T>,
) {
  return {
    description,
    results,
    holm: holmBonferroni(
      Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.p ?? null])),
    ),
  };
}

function mapValues<T, R>(source: Record<string, T>, transform: (value: T) => R): Record<string, R> {
  return Object.fromEntries(
    Object.entries(source)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => [key, transform(value)]),
  );
}
