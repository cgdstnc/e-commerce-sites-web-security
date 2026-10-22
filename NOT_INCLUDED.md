# Things this repository mentions but does not contain

This repository holds the code, what we measured, and the lists we started from. A few
things it mentions are not here. None of them are missing by accident.

| Mentioned | Why it is not here |
|---|---|
| `scripts/*.py`, such as `curate.py`, `step4_precision_sample.py`, `build_anon_release.py` | These do the literature search, the accuracy check and the packaging. None of them produce a measured number. The measurement and the analysis are in `src/`. |
| `data/raw_scan/...`, `NEDEN.md`, `step3g_browser.json` | Notes from runs we cancelled and from checking sites in a browser. We kept them in our working copy. The cancelled runs are listed so you know they happened and why we did not use them. |
| `raw_data/measurements_20260929.jsonl` | An earlier measurement we replaced. The numbers in the paper come from `raw_data/measurements_20261010.jsonl`. |
| Paths starting with `data/` | Our working copy keeps its input there. Here the same files are in `raw_data/`, and the decisions we made by hand are in `manual_decisions/`. |
| Files under `out/` | They appear when you run the code. See README. |
| The metric definitions and the sector rules | The paper explains them: the metric groups in the method section, the sampling rules in the sampling frame section. The exact form is in the code. |
| The literature search records | The reference list is in the paper. The search itself is not part of the measurement. |
| `results/`, the accuracy check write-up | The 50 decisions behind that figure are in `manual_decisions/03_` and `04_`, which is the evidence for it. The write-up itself was a worksheet we used while reviewing. |
| Notes for developers | We publish this so a reader of the paper can look at the code, not so that the code can be worked on here. |

`docs/ethics.md` holds the rules we had to follow while measuring. The paper points to it
directly. We wrote it in Turkish before we started measuring and translated it for this
repository; it is not a summary written afterwards.
