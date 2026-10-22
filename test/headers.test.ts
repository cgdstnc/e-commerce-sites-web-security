import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HeaderBag,
  countMixedContent,
  parseCookies,
  parseCsp,
  parseFraming,
  parseHsts,
  parseOtherHeaders,
  parseSecurityTxt,
} from "../src/measure/headers.ts";

const bag = (...pairs: Array<[string, string]>) => new HeaderBag(pairs);

test("header names are case-insensitive and duplicates are kept", () => {
  const headers = bag(["Set-Cookie", "a=1"], ["set-cookie", "b=2"], ["X-Frame-Options", " DENY "]);

  assert.deepEqual(headers.all("SET-COOKIE"), ["a=1", "b=2"]);
  assert.equal(headers.first("x-frame-options"), "DENY");
  assert.equal(headers.has("x-content-type-options"), false);
});

test("HSTS sent over HTTP is ignored (RFC 6797 7.2)", () => {
  const headers = bag(["Strict-Transport-Security", "max-age=31536000; includeSubDomains"]);

  const overHttp = parseHsts(headers, false);
  assert.equal(overHttp.hsts_present, false);
  assert.equal(overHttp.hsts_max_age, null);
  assert.equal(overHttp.hsts_ignored_over_http, true);

  const overHttps = parseHsts(headers, true);
  assert.equal(overHttps.hsts_present, true);
  assert.equal(overHttps.hsts_max_age, 31_536_000);
  assert.equal(overHttps.hsts_include_subdomains, true);
});

test("preload in the HSTS header is a claim, not membership", () => {
  const declared = parseHsts(bag(["Strict-Transport-Security", "max-age=1; preload"]), true);

  assert.equal(declared.hsts_preload, true);
  assert.ok(!("hsts_in_preload_list" in declared));
});

test("a CSP with no script source is not the same as one allowing unsafe-inline", () => {
  const noSources = parseCsp(bag(["Content-Security-Policy", "frame-ancestors 'none'"]));
  assert.equal(noSources.csp_present, true);
  assert.equal(noSources.csp_has_unsafe_inline, null);
  assert.equal(noSources.csp_has_frame_ancestors, true);

  const inline = parseCsp(bag(["Content-Security-Policy", "script-src 'self' 'unsafe-inline'"]));
  assert.equal(inline.csp_has_unsafe_inline, true);

  const fallback = parseCsp(bag(["Content-Security-Policy", "default-src 'self'"]));
  assert.equal(fallback.csp_has_unsafe_inline, false);
});

test("CSP report-only on its own does not count as an enforced policy", () => {
  const reportOnly = parseCsp(bag(["Content-Security-Policy-Report-Only", "script-src 'self'"]));

  assert.equal(reportOnly.csp_present, false);
  assert.equal(reportOnly.csp_report_only, true);
  assert.equal(reportOnly.csp_has_unsafe_inline, null);
});

test("a repeated or comma-joined X-Frame-Options is INVALID and gives no protection", () => {
  const none = { csp_has_frame_ancestors: false };

  assert.equal(parseFraming(bag(["X-Frame-Options", "DENY"]), none).x_frame_options, "DENY");
  assert.equal(parseFraming(bag(["X-Frame-Options", "SAMEORIGIN, DENY"]), none).framing_protected, false);
  assert.equal(
    parseFraming(bag(["X-Frame-Options", "DENY"], ["X-Frame-Options", "SAMEORIGIN"]), none).x_frame_options,
    "INVALID",
  );
  assert.equal(parseFraming(bag(["X-Frame-Options", "ALLOW-FROM https://a.example"]), none).framing_protected, false);
});

test("framing protection can come from XFO or from CSP frame-ancestors", () => {
  const viaCsp = parseFraming(bag(), { csp_has_frame_ancestors: true });

  assert.equal(viaCsp.x_frame_options, null);
  assert.equal(viaCsp.framing_protected, true);
});

test("the last Referrer-Policy token wins, and a loose one scores half", () => {
  const strict = parseOtherHeaders(bag(["Referrer-Policy", "no-referrer-when-downgrade, same-origin"]));
  assert.equal(strict.referrer_policy_strict, true);

  const loose = parseOtherHeaders(bag(["Referrer-Policy", "unsafe-url"]));
  assert.equal(loose.referrer_policy_strict, false);
});

test("a missing SameSite is its own category, not lax", () => {
  const cookies = parseCookies([
    "a=1; Secure; HttpOnly; SameSite=Lax",
    "b=2; Secure",
    "c=3; SameSite=None",
  ]);

  assert.equal(cookies.cookie_count, 3);
  assert.deepEqual(cookies.cookie_samesite_distribution, { strict: 0, lax: 1, none: 1, absent: 1 });

  assert.equal(cookies.cookie_secure_ratio, 0.6667);
  assert.equal(cookies.cookie_httponly_ratio, 0.3333);
  assert.equal(cookies.cookie_samesite_none_insecure, 1);
});

test("with no cookies the ratios are null, not zero", () => {
  const empty = parseCookies([]);

  assert.equal(empty.cookie_count, 0);
  assert.equal(empty.cookie_secure_ratio, null);
  assert.equal(empty.cookie_httponly_ratio, null);
});

test("mixed content can only be measured on an HTTPS page", () => {
  const html = '<img src="http://a.example/x.png"><script src="https://b.example/y.js"></script>';

  assert.equal(countMixedContent(html, true), 1);
  assert.equal(countMixedContent(html, false), null);
});

test("security.txt is null when unreachable and invalid without Contact", () => {
  assert.deepEqual(parseSecurityTxt(null, null, null), {
    security_txt_present: null,
    security_txt_valid: null,
  });
  assert.deepEqual(parseSecurityTxt(404, "text/html", ""), {
    security_txt_present: false,
    security_txt_valid: false,
  });
  assert.deepEqual(parseSecurityTxt(200, "text/plain; charset=utf-8", "Contact: mailto:a@b.c"), {
    security_txt_present: true,
    security_txt_valid: true,
  });
  assert.equal(parseSecurityTxt(200, "text/plain", "Expires: 2027-01-01").security_txt_valid, false);
});
