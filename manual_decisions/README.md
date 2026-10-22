# Records of the decisions we made by hand

Three points in the pipeline needed a person to look at a site and decide. The decisions
were written into the `evidence` and `tarayici_kanit` columns of the review tables. This
folder keeps the original records and the reason given for each one.

The point is that the work can be audited. If a reviewer asks why a given site was
included or left out, the answer is written down.

| File | What it holds | Decisions | Went into |
|---|---|---|---|
| `01_botduvari_35_karar.json` | the shortlist of sites behind a bot wall | 35 | `manual_review_blocked_shortlist.csv` |
| `02_supheli_24_karar.json` | the sites the evidence table could not settle | 24 | `sample_frame_review.csv` |
| `03_isabet_ornek_1-32.json` | the first part of the accuracy sample | 32 | the accuracy check reported in the paper |
| `04_isabet_ornek_33-50.json` | the rest of the accuracy sample | 18 | the accuracy check reported in the paper |
| `05_yumusak_duvar_22_karar.json` | sites that answered 2xx with an empty page | 22 | `manual_review_softwall_shortlist.csv` |

The format is `{"site": ["decision", "sector", "reason"]}`, or
`{"site": ["decision", "reason"]}` where there is no sector.

The accuracy sample is the 50 sites behind the figure in the paper: a fixed-seed random
draw from the 326 records that were classified from HTTP evidence alone. Each one was
opened in a browser and judged independently. All 50 decisions are here, so the figure
can be recomputed from this folder.

The reasons are in Turkish. They are the notes we wrote while deciding, and we left them
as written rather than translating a record after the fact.
