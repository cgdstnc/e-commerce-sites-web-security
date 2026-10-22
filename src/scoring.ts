import { round } from "./utils/round.ts";

const OBSERVATORY_PENALTIES = {
  csp: 25,
  cookies: 40,
  hsts: 20,
  framing: 20,
  https_redirect: 20,
  referrer_policy: 5,
  x_content_type_options: 5,
};

const observatoryTotal = Object.values(OBSERVATORY_PENALTIES).reduce((a, b) => a + b, 0);

const HEADER_WEIGHTS = Object.fromEntries(
  Object.entries(OBSERVATORY_PENALTIES).map(([name, penalty]) => [
    name,
    round((penalty * 100) / observatoryTotal, 2),
  ]),
) as Record<keyof typeof OBSERVATORY_PENALTIES, number>;

const COOKIE_SPLIT = { secure: 0.4, httponly: 0.35, samesite: 0.25 };

const TLS_WEIGHTS = {
  protocol_versions: 40,
  cert_valid: 30,
  tls13_support: 20,
  weak_ciphers: 10,
};

const OVERALL_WEIGHTS = { header: 0.5, tls: 0.5 };

const ONE_YEAR_SECONDS = 31_536_000;
const LEGACY_TLS = ["TLSv1.0", "TLSv1.1"];

export type Measurement = Record<string, unknown>;

type Rule = (record: Measurement) => number | null;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const bool = (value: unknown): number | null =>
  value === null || value === undefined ? null : value ? 1 : 0;

const HEADER_RULES: Record<keyof typeof HEADER_WEIGHTS, Rule> = {
  csp: (record) => {
    if (record["csp_present"] === null || record["csp_present"] === undefined) return null;
    if (!record["csp_present"]) return 0;

    let score = 1;
    if (record["csp_has_unsafe_inline"]) score -= 0.5;
    if (record["csp_has_unsafe_eval"]) score -= 0.25;
    return clamp(score);
  },

  cookies: (record) => {
    const count = record["cookie_count"];
    if (typeof count !== "number") return null;
    if (count === 0) return null;

    const distribution = (record["cookie_samesite_distribution"] ?? {}) as Record<string, number>;
    const declared = ["strict", "lax", "none"].reduce((sum, key) => sum + (distribution[key] ?? 0), 0);

    const ratios: Array<[keyof typeof COOKIE_SPLIT, unknown]> = [
      ["secure", record["cookie_secure_ratio"]],
      ["httponly", record["cookie_httponly_ratio"]],
      ["samesite", declared / count],
    ];

    let earned = 0;
    let weight = 0;
    for (const [key, ratio] of ratios) {
      if (typeof ratio !== "number") continue;
      earned += COOKIE_SPLIT[key] * clamp(ratio);
      weight += COOKIE_SPLIT[key];
    }
    return weight === 0 ? null : earned / weight;
  },

  hsts: (record) => {
    if (record["hsts_present"] === null || record["hsts_present"] === undefined) return null;
    if (!record["hsts_present"]) return 0;

    let score = 0.6;
    const maxAge = record["hsts_max_age"];
    if (typeof maxAge === "number" && maxAge >= ONE_YEAR_SECONDS) score += 0.2;
    if (record["hsts_include_subdomains"]) score += 0.1;
    if (record["hsts_in_preload_list"]) score += 0.1;
    return clamp(score);
  },

  framing: (record) => bool(record["framing_protected"]),
  https_redirect: (record) => bool(record["http_to_https_redirect"]),

  referrer_policy: (record) => {
    if (record["referrer_policy"] === null || record["referrer_policy"] === undefined) {
      return record["reachable"] ? 0 : null;
    }
    return record["referrer_policy_strict"] ? 1 : 0.5;
  },

  x_content_type_options: (record) => bool(record["x_content_type_options"]),
};

const TLS_RULES: Record<keyof typeof TLS_WEIGHTS, Rule> = {
  protocol_versions: (record) => {
    const versions = record["tls_protocol_versions_supported"];
    if (!Array.isArray(versions)) return null;
    return versions.some((version) => LEGACY_TLS.includes(version)) ? 0 : 1;
  },

  cert_valid: (record) => {
    const valid = record["tls_cert_valid_now"];
    const hostname = record["tls_cert_hostname_match"];
    if (valid == null && hostname == null) return null;
    return (valid ? 0.5 : 0) + (hostname ? 0.5 : 0);
  },

  tls13_support: (record) => {
    const versions = record["tls_protocol_versions_supported"];
    if (!Array.isArray(versions)) return null;
    return versions.includes("TLSv1.3") ? 1 : 0;
  },

  weak_ciphers: (record) => {
    const present = record["tls_weak_cipher_present"];
    return present == null ? null : present ? 0 : 1;
  },
};

export type SubScore = {
  score: number | null;
  covered_weight: number;
  total_weight: number;
  breakdown: Record<string, { ratio: number | null; weight: number; points: number | null }>;
};

export type Scores = {
  header_score: number | null;
  tls_score: number | null;
  overall_score: number | null;
  header_detail: SubScore;
  tls_detail: SubScore;
};

export function scoreRecord(record: Measurement): Scores {
  const header = subScore(record, HEADER_RULES, HEADER_WEIGHTS);
  const tls = subScore(record, TLS_RULES, TLS_WEIGHTS);

  let earned = 0;
  let weight = 0;
  if (header.score !== null) {
    earned += OVERALL_WEIGHTS.header * header.score;
    weight += OVERALL_WEIGHTS.header;
  }
  if (tls.score !== null) {
    earned += OVERALL_WEIGHTS.tls * tls.score;
    weight += OVERALL_WEIGHTS.tls;
  }

  return {
    header_score: header.score,
    tls_score: tls.score,
    overall_score: weight === 0 ? null : round(earned / weight, 1),
    header_detail: header,
    tls_detail: tls,
  };
}

function subScore(
  record: Measurement,
  rules: Record<string, Rule>,
  weights: Record<string, number>,
): SubScore {
  const breakdown: SubScore["breakdown"] = {};
  let earned = 0;
  let covered = 0;

  for (const [name, rule] of Object.entries(rules)) {
    const weight = weights[name] ?? 0;
    const ratio = rule(record);

    if (ratio === null) {
      breakdown[name] = { ratio: null, weight, points: null };
      continue;
    }

    const points = weight * ratio;
    earned += points;
    covered += weight;
    breakdown[name] = { ratio: round(ratio, 3), weight, points: round(points, 2) };
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return {
    score: covered === 0 ? null : round((100 * earned) / covered, 1),
    covered_weight: round(covered, 2),
    total_weight: round(total, 2),
    breakdown,
  };
}
