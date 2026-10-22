# What was changed for release

A script builds this repository from our working copy. We did not assemble
it by hand. Our names are in it. The names of the sites we measured are not.

## Site identifiers

Each site is called `S001` to `S426`. We shuffled the domain list with a fixed seed
(`20260927`) before handing out these numbers, so the order tells you nothing about how popular
a site is or where it falls in the alphabet. We keep the table that maps a number back to
a domain, and it is not in this repository.

Domains we crawled but did not pick for the sample are called `C00001` to `C15192`.

## Fields removed

| Field | Why |
|---|---|
| `domain` (all files) | Replaced by the identifier, not dropped: the pipeline joins on this key |
| `final_url`, `http_final_url` | Contain the full URL, and therefore the domain |
| `redirect_chain`, `http_redirect_chain` | Replaced by `*_length`; the lists held full URLs |
| `signals.title` (classification) | Page titles name the brand |
| `server` (classification) | Version banner, occasionally contained the host |
| `url` (request logs) | Replaced by `path`; the host is not needed to audit the rate limit |

Free-text fields, such as `note` and the reasons we wrote next to manual decisions, went
through a filter that replaces any domain or site name it finds.

## Other redactions

- The contact address in the `User-Agent` is shown exactly as we sent it. Our rules say
  the agent has to identify itself, and the logs show that it did.

- The manuscript itself, the project working notes and the raw literature-search
  dumps are not included.
- The sha256 values in `src/datasets.ts` and `expected/outputs.json` come from a run
  inside this repository. Using identifiers instead of domain names changes every file,
  so these are not the same hashes as in our working copy. The check still means
  something: your run has to produce exactly these files.
- Two words are deliberately left intact although they are also registered
  domains: `kahve` (a sector keyword in the classifier) and `desen` (an ordinary
  Turkish word in a comment). Replacing them would silently change behaviour.
  Research infrastructure hosts (DOI resolvers, the DergiPark and TR Dizin APIs,
  arXiv, Zenodo and similar) are likewise preserved, since they are sources
  rather than measured sites.

## Contents

| Path | Records |
|---|---|
| `raw_data/measurements_20261010.jsonl` | 426 measured sites |
| `raw_data/classification_20260928.jsonl` | 15618 crawled domains |
| `raw_data/measurement_request_log_20261010.jsonl` | 3066 requests |
| `raw_data/request_log_20260928.jsonl` | 43499 requests |
| `raw_data/sample_frame_review.csv` and the two shortlists | the review tables step 03h reads |
| `published/sample_frame.csv` | the final frame, identifiers only |
| `manual_decisions/` | the human decisions, with identifiers remapped |
| `src/` | the whole pipeline (TypeScript, no dependencies) |
| `test/` | 22 unit tests, run with `npm test` |
| `crosscheck/` | optional SciPy cross-check of every statistical test |
| `expected/` | sha256 of required output, and the reference analysis |
| `docs/` | the binding ethical boundaries |

The release is verified by an automated leak check that scans every file for
author identifiers and for any of the 15618 domain names involved in the study.
