# Ethical and Legal Boundaries

> This document defines the binding boundaries of the study. They are derived from the
> measurement plan and are described as such in the method section of the paper.
> **These boundaries cannot be violated.** If the measurement code requires behaviour
> that this document does not permit, the code changes, not the document.
>
> Version: 1.1, 2026-09-29. Translated from the Turkish original, which was
> written before the measurement began.

---

## 1. Governing principle: passive observation only

The study records the **configuration information that a server publishes voluntarily**
on publicly reachable web pages. Nothing beyond the response an ordinary visitor's
browser receives is collected.

Everything measured is data that any user visiting the site normally also receives: HTTP
response headers, TLS handshake parameters, certificate fields, and publicly published
`/.well-known/` resources.

---

## 2. What is never done (absolute prohibitions)

None of the following is done, for any reason:

| Prohibited | Scope |
|---|---|
| Authentication | Creating an account, logging in, any authentication attempt |
| Form submission | No POST, PUT or DELETE request of any kind |
| Shopping actions | Adding to cart, placing an order, test payment |
| Exploitation | XSS, SQLi, CSRF or any other attack attempt, including proof-of-concept |
| Directory or content scanning | Brute-force file and directory discovery, admin panel discovery, fuzzing |
| Load testing | High-volume concurrent requests, endurance testing |
| Attacks on authentication | Password attempts, session cookie theft or manipulation |
| Automated vulnerability scanners | OWASP ZAP active scan, Nikto, sqlmap and similar, in any active mode |
| Violating robots.txt | No request is made to any path closed by `Disallow` |
| Collecting personal data | Usernames, comments, email addresses or similar visible on the site are not recorded |

**Active vulnerability scanners are not used in any mode.** Reading headers passively does
not require such tools; our own measurement code issues only the requests it needs.

---

## 3. What is done, and its limits

### 3.1 Permitted request types

1. **`GET` requests**, only to these paths:
   - The root page of the domain (`/`)
   - `/robots.txt`, for the permission check, always the first request
   - `/.well-known/security.txt`, only if robots.txt permits it
   - The **URLs** of subresources declared in the root page HTML, for the mixed-content
     count. The subresources themselves are **not downloaded**; only their addresses are
     parsed out of the HTML.
2. **`HEAD` requests**, preferred over `GET` when following a redirect chain if that is
   sufficient.
3. **TLS handshakes**, to determine the supported protocol versions and the certificate.
   This establishes a connection without transferring data; no application-layer request
   is sent to the server.

No request is made to any other path, by any other method.

### 3.2 Rate and concurrency

| Limit | Value |
|---|---|
| Request rate per site | At most **1 request per second** |
| Total concurrency | At most **5** sites at a time |
| Total requests per site | Typically no more than 6 (robots, HTTP root, HTTPS root, security.txt, TLS handshakes) |
| Retries | At most 2 attempts per site, at least 5 seconds apart |
| Timeouts | 10 s to connect, 30 s in total |

If a `429 Too Many Requests` or `503` response is received, measurement of that site stops,
the record is marked `null`, and **it is not retried**.

### 3.3 Self-identification

Every request carries a User-Agent that states the research purpose and a contact address:

```
Mozilla/5.0 (compatible; EticaretGuvenlikArastirmasi/1.0;
 +mailto:cgdstnc@gmail.com) academic-research passive-measurement
```

A site owner looking at their logs can see who we are, what we are doing and how to reach
us. No browser is impersonated; the User-Agent is never hidden or randomised.

**Opt-out:** if a request to be excluded arrives at that address, the site is removed from
the sample immediately, its data is deleted, and the fact is reported in the paper without
naming the domain.

### 3.4 Compliance with robots.txt

- The **first request** to every site is `/robots.txt`.
- `User-agent: *` and any record specific to us are evaluated together; the more
  restrictive one applies.
- No request is made to any path covered by `Disallow`. If the root page is closed, the
  site is not measured and is recorded as `excluded` with the reason.
- If a `Crawl-delay` is declared and is greater than one second, **that value is honoured**.
- If robots.txt cannot be retrieved (404, timeout), only the root page and security.txt
  are attempted.

### 3.5 Verification visits

To confirm that a candidate site really is an e-commerce site, a limited number of sites
(no more than 150) are visited with a real browser, as an ordinary visitor would, and only
at the level of the home page. The browser naturally loads the page's subresources; this is
a deliberate exception to the allow-list in 3.1 and applies **only to the verification
stage**.

- **No measurement data is collected from these visits.** Measurement is performed only
  with the plain HTTP client described in 3.1.
- The prohibitions in section 2 apply unchanged: no login, no adding to cart, no test order.
- The sites visited and the evidence observed are recorded.

The rationale is that this is the same thing a researcher would do by hand; the only
difference is that a record is kept.

---

## 4. Data handling and publication

### 4.1 Anonymisation

- In the paper and in the published dataset, site names are **anonymised**: `S001`, `S002`
  and so on.
- The published dataset contains **no domain names**. It carries only the anonymous
  identifier, the sector label, the estimated size class and the measured metrics.
- The mapping between domain and anonymous identifier is kept locally and is **neither
  published nor shared**.
- Identifiers are assigned by a **seeded random permutation**, not in order of popularity;
  otherwise the ordering would reveal the domain.

### 4.2 No vulnerability detail is disclosed

- No exploitable vulnerability detail is written about any site.
- Findings are presented **only as aggregate statistics**: rates, means, distributions.
- No statement of the form "this site has this flaw" is made. Where an example is needed,
  the anonymous identifier and the configuration class are used, and no attack path is
  described.
- If a serious and concrete security problem is noticed on a site, it is not published;
  **responsible disclosure** is made through `security.txt` or the organisation's contact
  channel.

### 4.3 Personal data

The study collects no personal data. Every measured field concerns server configuration.
Cookie **values** are not recorded; only their count and their security flags (`Secure`,
`HttpOnly`, `SameSite`) are. Page content is not stored; only the scheme of the subresource
URLs needed for the mixed-content count is examined, and the HTML is discarded.

---

## 5. Legal basis and rationale

- The measurement issues ordinary `GET` requests to publicly reachable pages. No access
  control is circumvented and no authentication is attempted. This is a narrower activity
  than what a search engine crawler performs.
- robots.txt is honoured, so the site owner's declared intent is respected.
- The rate limits are set so that no measurable load is placed on any site.
- Because the collected data is not personal data, it does not constitute processing under
  Turkish data protection law (KVKK). Even so, domain names are not published, which also
  prevents indirect identifiability.
- Because findings are presented as aggregate statistics and no vulnerability detail is
  given, the published content does not make any site a target.

---

## 6. Ethics committee status

The study involves no human participants, processes no personal data and collects only
publicly available technical configuration data. On that basis it is assessed as not
requiring ethics committee approval. If the target journal requires such a statement,
this section serves as it.

---

## 7. Verifying that the code obeys this document

- The list of permitted paths and HTTP methods is defined in the measurement module as an
  **allow-list**; a request outside that list is rejected in code.
- Unit tests cover the rate limiter and the robots.txt check.
- Every measurement run keeps a timestamped record of all requests issued. That record is
  the evidence of compliance and is retained.

---

## 8. Version history

- **1.1, 2026-09-29.** Section 3.5 added: verification visits may use a real browser as a
  deliberate exception to the allow-list in 3.1, and no measurement data is collected from
  them.
- **1.0, 2026-09-27.** First version, derived from section 2 of the measurement plan. The
  allow-list of permitted paths and methods, the opt-out procedure, the seeded permutation
  for identifier assignment and the responsible disclosure clause were added as operational
  detail.
