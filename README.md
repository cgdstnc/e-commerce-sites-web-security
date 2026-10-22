# Web security configuration of Turkish e-commerce sites - replication package

Code and data for the paper of the same name. The sites we measured are not named. They
are other people's sites and they did not agree to be listed, so the data uses an
identifier for each site instead of its domain name. `ANON_NOTES.md` says what was taken
out and why.

## What this is

We measured HTTP security headers, TLS settings and cookie flags on 426 Turkish
e-commerce sites, without logging in or interacting with them. This package holds the
code that produced every number in the paper, the measurement records, and a log of
every request we sent.

## Requirements

Node 24 or newer. Nothing else. The code is TypeScript and Node runs it directly, so
there is no build step and no library to install. `npm test` works without running
`npm install` first. The `devDependencies` are only for type checking, which is
optional.

On older versions of Node this does not work and you get `Unknown file extension ".ts"`.
If you are not sure which version you have, run `node check-node.js` first.

## Verify it

```bash
npm test                                    # 22 unit tests, no install needed
node src/main.ts --audit                    # ethical compliance, from the request logs
node src/main.ts --verify                   # rebuild everything and compare hashes
```

We wrote the statistical tests ourselves, without any library. If you want to check them
against something independent, this script runs every test again with SciPy and stops if
a value does not match:

```bash
pip install -r crosscheck/requirements.txt    # scipy, numpy - only for this script
python3 crosscheck/crosscheck_stats_scipy.py
```

It compares 99 values and prints the largest difference it found.

The last command runs every step and compares `out/` against the recorded sha256 in
`expected/outputs.json` and the recorded analysis in `expected/analysis/`. It prints
`all checks passed` when everything matches. `published/` holds the authors' own copy of
the same output, so you can read the two side by side.

## Layout

```
src/              the code: building the sample, classifying, measuring, scoring, analysis
test/             unit tests for the scoring and header-parsing modules
crosscheck/       optional: recompute every statistical test with SciPy
expected/         sha256 of the files the code should produce, and the analysis to compare against
raw_data/         what we observed, read-only: measurements, the crawl, request logs
published/        our own copy of the results, for reading
out/              created when you run the commands above
manual_decisions/ the decisions we made by hand, with site identifiers in place of names
docs/             the binding ethical boundaries
```

## The three lists published by others

Steps 01 to 03a build the list of candidate sites from two public rankings, and the
measurement uses a third list. All three are here exactly as we downloaded them, so you do
not have to fetch anything. If you would rather not trust our copies, `src/datasets.ts`
gives the permanent address and the sha256 of each one, so you can download them yourself
and compare:

| File | Where it came from |
|---|---|
| `raw_data/tranco_Y8YJG_2026-09-26.csv` | https://tranco-list.eu/list/Y8YJG/1000000 |
| `raw_data/crux_tr_202608.csv.gz` | https://github.com/zakird/crux-top-lists, `data/country/tr/202608.csv.gz` |
| `raw_data/hsts_preload_20260929.json` | Chromium `transport_security_state_static.json` |

`node src/main.ts --verify` checks these three hashes before it starts.

## What cannot be re-run

Two steps looked at live websites in 2026, so they cannot be repeated: the classification
crawl (step 03b) and the security measurement (step 04). What they produced is kept in
`raw_data/`, and the sha256 of each file is recorded. Every later step always gives the
same result from the same input, and that is what the commands above check.

## Ethics

We only read what the sites already send to any visitor. We sent GET requests to public
pages, followed what robots.txt allowed, and never sent more than one request per second
to the same site. We did not log in, submit a form, add anything to a cart, or run a
vulnerability scanner. `docs/ethics.md` lists the rules we had to follow. `raw_data/`
holds a log of every request with its time, and `--audit` checks the rules against that
log.

We do not publish domain names, and we do not say that any particular site has a flaw.

## A note on language

The code, the output and the documents here are in English. Some of the data is not.
The `evidence` column of the sample frame and the reason fields in `manual_decisions/`
hold the notes we wrote while deciding, in Turkish. We left them as written instead of
translating a record after the fact. For the same reason the review tables in
`raw_data/` keep their original column names and values (`oneri`, `evet`, `hayir`), and
the code still reads them by those names. The patterns in `src/classify.ts` and
`src/sectors.ts` are Turkish because they match Turkish page text.
