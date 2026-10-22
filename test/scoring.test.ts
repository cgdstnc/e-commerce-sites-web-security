import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreRecord } from "../src/scoring.ts";
import { round } from "../src/utils/round.ts";

const reachable = {
  reachable: true,
  csp_present: false,
  cookie_count: 0,
  hsts_present: true,
  hsts_max_age: 31_536_000,
  framing_protected: true,
  http_to_https_redirect: true,
  referrer_policy: "strict-origin-when-cross-origin",
  referrer_policy_strict: true,
  x_content_type_options: true,
  tls_protocol_versions_supported: ["TLSv1.2", "TLSv1.3"],
  tls_cert_valid_now: true,
  tls_cert_hostname_match: true,
  tls_weak_cipher_present: false,
};

test("an item we could not measure leaves the denominator, it does not score zero", () => {
  const measured = scoreRecord({ ...reachable, framing_protected: false });
  const unmeasured = scoreRecord({ ...reachable, framing_protected: null });

  assert.equal(measured.header_detail.breakdown["framing"]!.points, 0);
  assert.equal(unmeasured.header_detail.breakdown["framing"]!.points, null);
  assert.ok(unmeasured.header_detail.covered_weight < measured.header_detail.covered_weight);
  assert.ok(unmeasured.header_score! > measured.header_score!);
});

test("a site that sets no cookies is kept apart from one with unsafe cookies", () => {
  const none = scoreRecord({ ...reachable, cookie_count: 0 });
  const insecure = scoreRecord({
    ...reachable,
    cookie_count: 2,
    cookie_secure_ratio: 0,
    cookie_httponly_ratio: 0,
    cookie_samesite_distribution: { strict: 0, lax: 0, none: 0, absent: 2 },
  });

  assert.equal(none.header_detail.breakdown["cookies"]!.ratio, null);
  assert.equal(insecure.header_detail.breakdown["cookies"]!.ratio, 0);
  assert.ok(none.header_score! > insecure.header_score!);
});

test("a cookie with no SameSite does not count as declaring one", () => {
  const declared = scoreRecord({
    ...reachable,
    cookie_count: 2,
    cookie_secure_ratio: 1,
    cookie_httponly_ratio: 1,
    cookie_samesite_distribution: { strict: 1, lax: 1, none: 0, absent: 0 },
  });
  const absent = scoreRecord({
    ...reachable,
    cookie_count: 2,
    cookie_secure_ratio: 1,
    cookie_httponly_ratio: 1,
    cookie_samesite_distribution: { strict: 0, lax: 0, none: 0, absent: 2 },
  });

  assert.equal(declared.header_detail.breakdown["cookies"]!.ratio, 1);
  assert.equal(absent.header_detail.breakdown["cookies"]!.ratio, 0.75);
});

test("unsafe-inline costs half the CSP points and unsafe-eval a quarter", () => {
  const strict = scoreRecord({ ...reachable, csp_present: true });
  const inline = scoreRecord({ ...reachable, csp_present: true, csp_has_unsafe_inline: true });
  const both = scoreRecord({
    ...reachable,
    csp_present: true,
    csp_has_unsafe_inline: true,
    csp_has_unsafe_eval: true,
  });

  assert.equal(strict.header_detail.breakdown["csp"]!.ratio, 1);
  assert.equal(inline.header_detail.breakdown["csp"]!.ratio, 0.5);
  assert.equal(both.header_detail.breakdown["csp"]!.ratio, 0.25);
});

test("a claimed preload and real membership in the list are scored apart", () => {
  const declaredOnly = scoreRecord({
    ...reachable,
    hsts_present: true,
    hsts_max_age: 31_536_000,
    hsts_preload: true,
    hsts_in_preload_list: false,
  });
  const listed = scoreRecord({
    ...reachable,
    hsts_present: true,
    hsts_max_age: 31_536_000,
    hsts_preload: true,
    hsts_in_preload_list: true,
  });

  assert.equal(declaredOnly.header_detail.breakdown["hsts"]!.ratio, 0.8);
  assert.equal(listed.header_detail.breakdown["hsts"]!.ratio, 0.9);
});

test("offering an old TLS version zeroes the version item", () => {
  const modern = scoreRecord(reachable);
  const legacy = scoreRecord({
    ...reachable,
    tls_protocol_versions_supported: ["TLSv1.0", "TLSv1.1", "TLSv1.2", "TLSv1.3"],
  });

  assert.equal(modern.tls_detail.breakdown["protocol_versions"]!.ratio, 1);
  assert.equal(legacy.tls_detail.breakdown["protocol_versions"]!.ratio, 0);
});

test("a weak cipher we could not test does not count as refused", () => {
  const refused = scoreRecord({ ...reachable, tls_weak_cipher_present: false });
  const untestable = scoreRecord({ ...reachable, tls_weak_cipher_present: null });

  assert.equal(refused.tls_detail.breakdown["weak_ciphers"]!.ratio, 1);
  assert.equal(untestable.tls_detail.breakdown["weak_ciphers"]!.ratio, null);
  assert.ok(untestable.tls_detail.covered_weight < refused.tls_detail.covered_weight);
});

test("if one sub-score is missing the overall score equals the other", () => {
  const record = {
    ...reachable,
    tls_protocol_versions_supported: null,
    tls_cert_valid_now: null,
    tls_cert_hostname_match: null,
    tls_weak_cipher_present: null,
  };
  const scores = scoreRecord(record);

  assert.equal(scores.tls_score, null);
  assert.equal(scores.overall_score, round(scores.header_score!, 1));
});

test("with nothing measurable the score is null, not zero", () => {
  const scores = scoreRecord({ reachable: false });

  assert.equal(scores.header_score, null);
  assert.equal(scores.tls_score, null);
  assert.equal(scores.overall_score, null);
});

test("rounding reads the decimal form instead of multiplying", () => {
  assert.equal(round(60.55, 1), 60.5);
  assert.equal(round(79.85, 1), 79.8);
  assert.equal(round(77.85, 1), 77.8);
  assert.equal(round(-60.55, 1), -60.5);

  assert.equal(round(0.5), 0);
  assert.equal(round(1.5), 2);
  assert.equal(round(2.5), 2);
  assert.equal(round(3.5), 4);
});
