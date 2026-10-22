# Analysis results

> Written by `src/steps/06-analyze.ts`. Do not edit by hand.
> Source: `raw_data/measurements_20261010.jsonl`, n=426 sites

## 1. Descriptive results

Each row has its own denominator: records that could not be measured are left out.

| Metric | Rate | n | Denominator |
|---|---|---|---|
| Sends HSTS | 63.5% | 425 | all measured sites |
| HSTS includeSubDomains | 30.7% | 270 | sites sending HSTS |
| In the HSTS preload list | 0.9% | 425 | all sites |
| Sends CSP | 48.9% | 425 | all sites |
| CSP frame-ancestors | 74.5% | 208 | sites sending CSP |
| CSP unsafe-inline | 82.9% | 35 | sites defining a script source |
| X-Content-Type-Options nosniff | 61.4% | 425 | all sites |
| Strict Referrer-Policy | 93.4% | 106 | sites sending a policy |
| Framing protected | 60.9% | 425 | all sites |
| HTTP to HTTPS redirect | 96.5% | 424 | sites reachable over HTTP |
| Certificate valid | 100.0% | 426 | sites with a TLS handshake |
| Certificate matches hostname | 99.8% | 426 | sites with a TLS handshake |
| Accepts a weak cipher | 0.0% | 407 | sites that could be tested |
| Has security.txt | 1.0% | 402 | sites where robots allowed it |
| Server header leaks a version | 4.2% | 425 | all sites |
| Offers TLS 1.0/1.1 | 24.2% | 426 | sites with a TLS handshake |

### Cookie flags

357 sites set 967 cookies on the landing page.

| Flag | Per cookie | n | Per site mean |
|---|---|---|---|
| Secure | 85.4% | 967 | 84.6% |
| HttpOnly | 67.0% | 967 | 70.1% |
| SameSite strict | 7.0% | 967 | |
| SameSite lax | 27.4% | 967 | |
| SameSite none | 46.6% | 967 | |
| SameSite absent | 18.9% | 967 | |

### Secondary metrics

Reported for completeness. These are not part of the group comparison family.

| Metric | Rate | n | Denominator |
|---|---|---|---|
| Sends Permissions-Policy | 24.0% | 425 | all sites |
| Sends the legacy Feature-Policy | 0.9% | 425 | all sites |
| Sends Cross-Origin-Opener-Policy | 4.2% | 425 | all sites |
| Sends Cross-Origin-Resource-Policy | 2.6% | 425 | all sites |
| Sends X-Powered-By | 29.9% | 425 | all sites |
| CSP unsafe-eval | 91.4% | 35 | sites defining a script source |
| CSP nonce | 20.0% | 35 | sites defining a script source |
| CSP strict-dynamic | 0.0% | 35 | sites defining a script source |
| Permissions-Policy naming one directive | 46.1% | 102 | sites sending Permissions-Policy |
| Loads at least one resource over plain HTTP | 2.6% | 424 | sites with an HTML body |

CSP directive count, over the 208 sites sending a policy: median 2.0, mean 2.8, max 13.0.
Plain HTTP subresources found in the landing pages: 49.

### Maturity scores

| Score | n | Mean | Median | SD | Min | Max |
|---|---|---|---|---|---|---|
| header_score | 426 | 62.4 | 69.9 | 25.2 | 0.0 | 97.9 |
| tls_score | 426 | 89.1 | 100.0 | 17.7 | 33.3 | 100.0 |
| overall_score | 426 | 75.7 | 79.7 | 17.9 | 30.0 | 99.0 |

## 2. By size stratum (RQ4)

`D_botduvari` is **left out** of this comparison: D_botduvari is left out of the size comparison. It is not a size class but a group added by hand, because these sites could not be classified from their content, and its selection probability is 1.0.

| Stratum | n | overall_score median | Q1-Q3 | In the test |
|---|---|---|---|---|
| A_buyuk | 134 | 79.8 | 65.2-91.8 | yes |
| B_orta | 134 | 86.3 | 60.8-92.4 | yes |
| C_kucuk | 134 | 76.7 | 60.5-92.4 | yes |
| D_botduvari | 24 | 74.5 | 59.8-88.2 | **no** (shown for reference) |

| Variable | Test | Statistic | p (raw) | p (Holm) | Effect size |
|---|---|---|---|---|---|
| header_score | Kruskal-Wallis H | 0.602 | 0.7400 | 1.0000 | epsilon-squared = 0 (negligible) |
| tls_score | Kruskal-Wallis H | 1.824 | 0.4017 | 1.0000 | epsilon-squared = 0 (negligible) |
| overall_score | Kruskal-Wallis H | 0.121 | 0.9412 | 1.0000 | epsilon-squared = 0 (negligible) |

## 3. By sector (RQ4)

| Sector | n | overall_score median | Q1-Q3 |
|---|---|---|---|
| diger | 237 | 77.8 | 60.5-92.4 |
| moda | 93 | 80.8 | 63.4-89.7 |
| market | 37 | 71.3 | 60.5-87.4 |
| mobilya | 25 | 82.2 | 67.0-92.4 |
| elektronik | 22 | 89.5 | 71.2-95.2 |
| kozmetik | 12 | 91.2 | 85.5-95.2 |

| Variable | Test | Statistic | p (raw) | p (Holm) | Effect size |
|---|---|---|---|---|---|
| header_score | Kruskal-Wallis H | 12.018 | 0.0345 | 0.1036 | epsilon-squared = 0.017 (small) |
| tls_score | Kruskal-Wallis H | 6.215 | 0.2858 | 0.2858 | epsilon-squared = 0.003 (negligible) |
| overall_score | Kruskal-Wallis H | 10.937 | 0.0526 | 0.1053 | epsilon-squared = 0.014 (small) |

## 4. Kategorik testler

### Header or property present, by size stratum

| Metric | Test | p (raw) | p (Holm) | Effect (Cramer's V) | Result |
|---|---|---|---|---|---|
| hsts_present | Chi-square | 0.0888 | 0.9772 | 0.11 (small) | not significant |
| hsts_include_subdomains | Chi-square | 0.0014 | 0.0181 | 0.228 (small) | significant |
| hsts_in_preload_list | Chi-square | 0.3674 | 1.0000 | 0.071 (negligible) | **not reliable** |
| csp_present | Chi-square | 0.3103 | 1.0000 | 0.076 (negligible) | not significant |
| csp_has_frame_ancestors | Chi-square | 0.3320 | 1.0000 | 0.106 (small) | not significant |
| csp_has_unsafe_inline | Chi-square | 0.1018 | 0.9977 | 0.411 (medium) | **not reliable** |
| x_content_type_options | Chi-square | 0.5156 | 1.0000 | 0.057 (negligible) | not significant |
| referrer_policy_strict | Chi-square | 0.3556 | 1.0000 | 0.15 (small) | **not reliable** |
| framing_protected | Chi-square | 0.3560 | 1.0000 | 0.072 (negligible) | not significant |
| http_to_https_redirect | Chi-square | 0.9129 | 1.0000 | 0.021 (negligible) | **not reliable** |
| tls_cert_valid_now | - | - | - | undefined (undefined) | not significant |
| tls_cert_hostname_match | Chi-square | 0.3670 | 1.0000 | 0.071 (negligible) | **not reliable** |
| tls_weak_cipher_present | - | - | - | undefined (undefined) | not significant |
| security_txt_present | Chi-square | 0.0533 | 0.6396 | 0.123 (small) | **not reliable** |
| server_header_discloses_version | Chi-square | 0.0998 | 0.9977 | 0.107 (small) | not significant |

**Tests that are not reliable.** The p-value is shown for information only;
no decision about significance was made:

- `hsts_in_preload_list`: NOT RELIABLE: expected frequency below 1 in 1 cells; expected frequency below 5 in 3/6 cells (over the Cochran limit); the rarest category has only 3 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `csp_has_unsafe_inline`: NOT RELIABLE: expected frequency below 1 in 3 cells; expected frequency below 5 in 4/6 cells (over the Cochran limit); the rarest category has only 1 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `referrer_policy_strict`: NOT RELIABLE: expected frequency below 5 in 3/6 cells (over the Cochran limit); the rarest category has only 6 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `http_to_https_redirect`: NOT RELIABLE: expected frequency below 5 in 3/6 cells (over the Cochran limit). The p-value is shown for information only; no decision about significance was made.
- `tls_cert_hostname_match`: NOT RELIABLE: expected frequency below 1 in 3 cells; expected frequency below 5 in 3/6 cells (over the Cochran limit); the rarest category has only 1 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `security_txt_present`: NOT RELIABLE: expected frequency below 1 in 1 cells; expected frequency below 5 in 3/6 cells (over the Cochran limit); the rarest category has only 3 observations (<10). The p-value is shown for information only; no decision about significance was made.

### Header or property present, by sector (sectors with n<5 left out)

| Metric | Test | p (raw) | p (Holm) | Effect (Cramer's V) | Result |
|---|---|---|---|---|---|
| hsts_present | Chi-square | 0.0277 | 0.3124 | 0.172 (small) | not significant |
| hsts_include_subdomains | Chi-square | 0.7083 | 1.0000 | 0.104 (small) | not significant |
| hsts_in_preload_list | Chi-square | 0.6655 | 1.0000 | 0.087 (negligible) | **not reliable** |
| csp_present | Chi-square | 0.0530 | 0.4771 | 0.16 (small) | not significant |
| csp_has_frame_ancestors | Chi-square | 0.5814 | 1.0000 | 0.135 (small) | **not reliable** |
| csp_has_unsafe_inline | Fisher exact (a cell has expected <5) | 0.2589 | 1.0000 | 0.231 (small) | **not reliable** |
| x_content_type_options | Chi-square | 0.0282 | 0.3124 | 0.172 (small) | not significant |
| referrer_policy_strict | Chi-square | 0.7329 | 1.0000 | 0.139 (small) | **not reliable** |
| framing_protected | Chi-square | 0.0260 | 0.3124 | 0.173 (small) | not significant |
| http_to_https_redirect | Chi-square | 0.4506 | 1.0000 | 0.106 (small) | **not reliable** |
| tls_cert_valid_now | - | - | - | undefined (undefined) | not significant |
| tls_cert_hostname_match | Chi-square | 0.9771 | 1.0000 | 0.043 (negligible) | **not reliable** |
| tls_weak_cipher_present | - | - | - | undefined (undefined) | not significant |
| security_txt_present | Chi-square | 0.0031 | 0.0405 | 0.211 (small) | **not reliable** |
| server_header_discloses_version | Chi-square | 0.2389 | 1.0000 | 0.126 (small) | **not reliable** |

**Tests that are not reliable.** The p-value is shown for information only;
no decision about significance was made:

- `hsts_in_preload_list`: NOT RELIABLE: expected frequency below 1 in 5 cells; expected frequency below 5 in 6/12 cells (over the Cochran limit); the rarest category has only 4 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `csp_has_frame_ancestors`: NOT RELIABLE: expected frequency below 5 in 4/12 cells (over the Cochran limit). The p-value is shown for information only; no decision about significance was made.
- `csp_has_unsafe_inline`: NOT RELIABLE: expected frequency below 5 in 2/4 cells (over the Cochran limit); the rarest category has only 4 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `referrer_policy_strict`: NOT RELIABLE: expected frequency below 1 in 3 cells; expected frequency below 5 in 6/10 cells (over the Cochran limit); the rarest category has only 7 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `http_to_https_redirect`: NOT RELIABLE: expected frequency below 1 in 3 cells; expected frequency below 5 in 5/12 cells (over the Cochran limit). The p-value is shown for information only; no decision about significance was made.
- `tls_cert_hostname_match`: NOT RELIABLE: expected frequency below 1 in 6 cells; expected frequency below 5 in 6/12 cells (over the Cochran limit); the rarest category has only 1 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `security_txt_present`: NOT RELIABLE: expected frequency below 1 in 5 cells; expected frequency below 5 in 6/12 cells (over the Cochran limit); the rarest category has only 4 observations (<10). The p-value is shown for information only; no decision about significance was made.
- `server_header_discloses_version`: NOT RELIABLE: expected frequency below 1 in 2 cells; expected frequency below 5 in 5/12 cells (over the Cochran limit). The p-value is shown for information only; no decision about significance was made.

## 5. Sensitivity check: bot walls

A bot wall was seen on **13** sites. On those sites the headers may come from
the firewall response rather than the origin, whose real settings may differ.

| Variable | Test | Statistic | p (raw) | p (Holm) | Effect size |
|---|---|---|---|---|---|
| header_score | Mann-Whitney U | 2205.000 | 0.2724 | 0.6019 | rank-biserial r = -0.179 (small) |
| tls_score | Mann-Whitney U | 2239.500 | 0.2007 | 0.6019 | rank-biserial r = -0.166 (small) |
| overall_score | Mann-Whitney U | 2204.500 | 0.2720 | 0.6019 | rank-biserial r = -0.179 (small) |

### Rates with those sites removed

| Metric | All sites | Bot walls removed |
|---|---|---|
| Sends HSTS | %63.5 (n=425) | %63.8 (n=412) |
| HSTS includeSubDomains | %30.7 (n=270) | %30.0 (n=263) |
| In the HSTS preload list | %0.9 (n=425) | %1.0 (n=412) |
| Sends CSP | %48.9 (n=425) | %49.0 (n=412) |
| CSP frame-ancestors | %74.5 (n=208) | %76.2 (n=202) |
| CSP unsafe-inline | %82.9 (n=35) | %96.7 (n=30) |
| X-Content-Type-Options nosniff | %61.4 (n=425) | %61.7 (n=412) |
| Strict Referrer-Policy | %93.4 (n=106) | %92.9 (n=99) |
| Framing protected | %60.9 (n=425) | %60.7 (n=412) |
| HTTP to HTTPS redirect | %96.5 (n=424) | %97.6 (n=411) |
| Certificate valid | %100.0 (n=426) | %100.0 (n=413) |
| Certificate matches hostname | %99.8 (n=426) | %99.8 (n=413) |
| Accepts a weak cipher | %0.0 (n=407) | %0.0 (n=395) |
| Has security.txt | %1.0 (n=402) | %1.0 (n=399) |
| Server header leaks a version | %4.2 (n=425) | %4.4 (n=412) |

## 6. Notes on method

- Normality was checked with Shapiro-Wilk. The score distributions were not
  normal, so non-parametric tests were used.
- Two groups: Mann-Whitney U, effect size rank-biserial *r*.
- Three or more groups: Kruskal-Wallis H, effect size epsilon-squared.
- Categorical: chi-square, and Fisher exact for 2x2 tables with an expected
  frequency below 5. Effect size Cramer's V.
- Holm-Bonferroni correction was applied within each family of tests. Both raw
  and adjusted p-values are reported.
- Groups with n<5 were not tested, and that is stated in the report.
- **Weighting.** The strata were sampled with different probabilities
  (A 0.1822, B 0.2464, C 0.2261, D 1.0). The rates here are **unweighted**.
  To estimate a population rate, apply the stratum weights.