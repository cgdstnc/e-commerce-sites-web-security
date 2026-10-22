import { round } from "../utils/round.ts";

export class HeaderBag {
  #values = new Map<string, string[]>();

  constructor(pairs: Array<[string, string]>) {
    for (const [name, value] of pairs) {
      const key = name.toLowerCase().trim();
      this.#values.set(key, [...(this.#values.get(key) ?? []), value.trim()]);
    }
  }

  all(name: string): string[] {
    return this.#values.get(name.toLowerCase()) ?? [];
  }

  first(name: string): string | null {
    return this.all(name)[0] ?? null;
  }

  has(name: string): boolean {
    return this.#values.has(name.toLowerCase());
  }

  names(): string[] {
    return [...this.#values.keys()].sort();
  }
}

const tokens = (value: string) =>
  value.split(";").map((token) => token.trim()).filter((token) => token !== "");

export function parseHsts(headers: HeaderBag, overHttps: boolean) {
  const values = headers.all("strict-transport-security");

  if (!overHttps) {
    return {
      hsts_present: false,
      hsts_max_age: null,
      hsts_include_subdomains: null,
      hsts_preload: null,
      hsts_raw: values[0] ?? null,
      hsts_duplicate: null,
      hsts_ignored_over_http: values.length > 0,
    };
  }

  const base = {
    hsts_present: values.length > 0,
    hsts_max_age: null as number | null,
    hsts_include_subdomains: null as boolean | null,
    hsts_preload: null as boolean | null,
    hsts_raw: values[0] ?? null,
    hsts_duplicate: values.length > 1,
    hsts_ignored_over_http: false,
  };
  if (values.length === 0) return base;

  const parts = tokens(values[0]!);
  const lowered = parts.map((part) => part.toLowerCase());
  const maxAge = parts
    .map((part) => /^max-age\s*=\s*"?(\d+)"?$/i.exec(part))
    .find((match) => match !== null);

  return {
    ...base,
    hsts_include_subdomains: lowered.includes("includesubdomains"),
    hsts_preload: lowered.includes("preload"),
    hsts_max_age: maxAge ? Number(maxAge[1]) : null,
  };
}

function parsePolicy(policy: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};

  for (const part of policy.split(";")) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length === 0) continue;
    directives[bits[0]!.toLowerCase()] = bits.slice(1);
  }
  return directives;
}

function effectiveScriptSources(directives: Record<string, string[]>): string[] | null {
  return directives["script-src"] ?? directives["default-src"] ?? null;
}

export function parseCsp(headers: HeaderBag) {
  const enforced = headers.all("content-security-policy");
  const reportOnly = headers.all("content-security-policy-report-only");

  const base = {
    csp_present: enforced.length > 0,
    csp_report_only: reportOnly.length > 0,
    csp_policy_count: enforced.length,
    csp_directive_count: null as number | null,
    csp_has_unsafe_inline: null as boolean | null,
    csp_has_unsafe_eval: null as boolean | null,
    csp_has_frame_ancestors: null as boolean | null,
    csp_has_nonce: null as boolean | null,
    csp_has_strict_dynamic: null as boolean | null,
    csp_raw: null as string | string[] | null,
  };
  if (enforced.length === 0) return base;

  const policies = enforced.map(parsePolicy);
  const directiveNames = new Set(policies.flatMap((policy) => Object.keys(policy)));

  let sawSources = false;
  let unsafeInline = false;
  let unsafeEval = false;
  let nonce = false;
  let strictDynamic = false;

  for (const policy of policies) {
    const sources = effectiveScriptSources(policy);
    if (sources === null) continue;

    sawSources = true;
    const lowered = sources.map((source) => source.toLowerCase());
    unsafeInline ||= lowered.includes("'unsafe-inline'");
    unsafeEval ||= lowered.includes("'unsafe-eval'");
    strictDynamic ||= lowered.includes("'strict-dynamic'");
    nonce ||= lowered.some((source) => source.startsWith("'nonce-"));
  }

  return {
    ...base,
    csp_raw: enforced.length > 1 ? enforced : enforced[0]!,
    csp_directive_count: directiveNames.size,
    csp_has_frame_ancestors: directiveNames.has("frame-ancestors"),
    csp_has_unsafe_inline: sawSources ? unsafeInline : null,
    csp_has_unsafe_eval: sawSources ? unsafeEval : null,
    csp_has_nonce: sawSources ? nonce : null,
    csp_has_strict_dynamic: sawSources ? strictDynamic : null,
  };
}

const VALID_XFO = ["deny", "sameorigin"];

export function parseFraming(headers: HeaderBag, csp: { csp_has_frame_ancestors: boolean | null }) {
  const values = headers.all("x-frame-options");
  let option: string | null = null;

  if (values.length > 0) {
    if (values.length > 1 || values[0]!.includes(",")) {
      option = "INVALID";
    } else {
      const value = values[0]!.trim().toLowerCase();
      if (VALID_XFO.includes(value)) option = value.toUpperCase();
      else if (value.startsWith("allow-from")) option = "ALLOW-FROM";
      else option = "INVALID";
    }
  }

  const protectedByXfo = option === "DENY" || option === "SAMEORIGIN";

  return {
    x_frame_options: option,
    x_frame_options_raw: values.length > 1 ? values : (values[0] ?? null),
    frame_ancestors_defined: csp.csp_has_frame_ancestors,
    framing_protected: protectedByXfo || Boolean(csp.csp_has_frame_ancestors),
  };
}

const STRICT_REFERRER = [
  "no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin",
];

export function parseOtherHeaders(headers: HeaderBag) {
  const nosniffValues = headers.all("x-content-type-options");
  const referrerValues = headers.all("referrer-policy");
  const referrer = referrerValues[0]?.trim().toLowerCase() ?? null;

  const referrerTokens = referrer
    ? referrer.split(",").map((token) => token.trim()).filter(Boolean)
    : [];

  const permissions = headers.first("permissions-policy");
  const server = headers.first("server");

  return {
    x_content_type_options: nosniffValues.length > 0
      ? nosniffValues[0]!.trim().toLowerCase() === "nosniff"
      : false,
    x_content_type_options_raw: nosniffValues[0] ?? null,
    referrer_policy: referrer,
    referrer_policy_strict: referrer === null
      ? null
      : referrerTokens.length > 0 && STRICT_REFERRER.includes(referrerTokens.at(-1)!),
    permissions_policy: permissions,
    permissions_policy_count: permissions === null
      ? null
      : permissions.split(",").filter((part) => part.trim() !== "").length,
    feature_policy_legacy: headers.first("feature-policy"),
    coop: headers.first("cross-origin-opener-policy"),
    corp: headers.first("cross-origin-resource-policy"),
    server_header_raw: server,
    server_header_discloses_version: headers.has("server") ? /\d+\.\d+/.test(server ?? "") : false,
    x_powered_by_present: headers.has("x-powered-by"),
    x_powered_by_raw: headers.first("x-powered-by"),
  };
}

export function parseCookies(setCookieValues: string[]) {
  const distribution = { strict: 0, lax: 0, none: 0, absent: 0 };
  const names: string[] = [];

  const base = {
    cookie_count: setCookieValues.length,
    cookie_secure_ratio: null as number | null,
    cookie_httponly_ratio: null as number | null,
    cookie_samesite_distribution: distribution,
    cookie_samesite_none_insecure: 0,
    cookie_names: names,
  };
  if (setCookieValues.length === 0) return base;

  let secure = 0;
  let httpOnly = 0;
  let noneInsecure = 0;

  for (const raw of setCookieValues) {
    const parts = tokens(raw);
    if (parts.length === 0) continue;

    names.push(parts[0]!.split("=", 1)[0]!.trim());
    const attributes = parts.slice(1).map((part) => part.toLowerCase());

    const isSecure = attributes.includes("secure");
    if (isSecure) secure++;
    if (attributes.includes("httponly")) httpOnly++;

    const sameSite = attributes
      .map((attribute) => /^samesite\s*=\s*(\w+)$/.exec(attribute)?.[1]?.toLowerCase())
      .find((value) => value !== undefined);

    if (sameSite === "strict" || sameSite === "lax" || sameSite === "none") {
      distribution[sameSite]++;
      if (sameSite === "none" && !isSecure) noneInsecure++;
    } else {
      distribution.absent++;
    }
  }

  return {
    ...base,
    cookie_secure_ratio: round(secure / setCookieValues.length, 4),
    cookie_httponly_ratio: round(httpOnly / setCookieValues.length, 4),
    cookie_samesite_none_insecure: noneInsecure,
  };
}

const SUBRESOURCE_PATTERNS = [
  /<script[^>]+src\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<link[^>]+href\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<img[^>]+src\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<iframe[^>]+src\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<video[^>]+src\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<audio[^>]+src\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<source[^>]+src\s*=\s*["'](http:\/\/[^"']+)/gi,
  /<object[^>]+data\s*=\s*["'](http:\/\/[^"']+)/gi,
];

export function countMixedContent(html: string, pageIsHttps: boolean): number | null {
  if (!pageIsHttps) return null;

  return SUBRESOURCE_PATTERNS.reduce(
    (total, pattern) => total + (html.match(pattern)?.length ?? 0),
    0,
  );
}

export function parseSecurityTxt(
  status: number | null,
  contentType: string | null,
  body: string | null,
) {
  if (status === null) return { security_txt_present: null, security_txt_valid: null };

  const present = status === 200 && (contentType ?? "").toLowerCase().includes("text/plain");
  if (!present) return { security_txt_present: false, security_txt_valid: false };

  return { security_txt_present: true, security_txt_valid: /^\s*contact\s*:/im.test(body ?? "") };
}
