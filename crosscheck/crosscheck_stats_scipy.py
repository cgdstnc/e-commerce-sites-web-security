import csv
import glob
import json
import os
import sys

import numpy as np
from scipy import stats

def locate():
    for out, raw in (("pipeline/out", "pipeline/raw_data"),
                     ("out", "raw_data"),
                     ("published", "raw_data")):
        tests = os.path.join(out, "group_tests.json")
        if os.path.exists(tests):
            measurements = glob.glob(os.path.join(raw, "measurements_*.jsonl"))
            if not measurements:
                continue
            return tests, os.path.join(out, "scores.csv"), sorted(measurements)[-1]
    sys.exit("group_tests.json / scores.csv / measurements bulunamadi")

TESTS, SCORES, MEASUREMENTS = locate()

GROUP_FIELD = {
    "scores_by_size": "stratum",
    "headers_by_size": "stratum",
    "scores_by_sector": "sector",
    "headers_by_sector": "sector",
    "sensitivity_bot_wall": "bot_group",
}

TOLERANCE = 1e-9

SHAPIRO_P_TOLERANCE = 1e-6

def load_groups():
    observed = {}
    for line in open(MEASUREMENTS, encoding="utf-8"):
        record = json.loads(line)
        observed[record["domain"]] = bool(record.get("bot_blocked_observed"))

    rows = []
    for r in csv.DictReader(open(SCORES, encoding="utf-8")):
        blocked = observed.get(r["domain"], False)
        rows.append({
            "stratum": r["stratum"],
            "sector": r["sector"],
            "bot_group": "bot_duvari" if blocked else "normal",
            **{f: (float(r[f]) if r[f] not in ("", "None") else None)
               for f in ("header_score", "tls_score", "overall_score")},
        })
    return rows

def arrays(rows, field, key, groups):
    out = []
    for g in groups:
        vals = [r[field] for r in rows if r[key] == g and r[field] is not None]
        out.append(np.asarray(vals, dtype=float))
    return out

def close(ours, theirs, tol):
    if ours is None or theirs is None:
        return ours is theirs, float("nan")
    scale = max(abs(ours), abs(theirs), 1e-300)
    diff = abs(ours - theirs) / scale
    return diff <= tol, diff

def main():
    doc = json.load(open(TESTS, encoding="utf-8"))
    rows = load_groups()
    failed = skipped = 0
    diffs = {"test p": [], "Shapiro-Wilk p": [], "Shapiro-Wilk W": []}

    for family, block in doc["families"].items():
        print("\n== %s" % family)
        for name, result in block["results"].items():
            test = result.get("test")
            if test is None:
                print("   %-32s atlandi (%s)" % (name, result.get("note")))
                skipped += 1
                continue

            key = GROUP_FIELD[family]

            if test.startswith("Kruskal"):
                data = arrays(rows, name, key, result["groups_tested"])
                statistic, p = stats.kruskal(*data)
            elif test.startswith("Mann-Whitney"):
                data = arrays(rows, name, key, ["bot_duvari", "normal"])
                statistic, p = stats.mannwhitneyu(*data, alternative="two-sided")
            elif test.startswith("Chi-square"):
                statistic, p, _, _ = stats.chi2_contingency(
                    np.asarray(result["observed"]), correction=result.get("yates", False))
            elif test.startswith("Fisher"):
                statistic, p = stats.fisher_exact(np.asarray(result["observed"]))
            else:
                print("   %-32s BILINMEYEN TEST: %s" % (name, test))
                failed += 1
                continue

            ok, diff = close(result["p"], float(p), TOLERANCE)
            diffs["test p"].append(abs(result["p"] - float(p)))
            if not ok:
                failed += 1
            print("   %-32s %-10s p: bizde %.10g  scipy %.10g  bagil fark %.1e  %s"
                  % (name, test.split()[0], result["p"], p, diff, "TAMAM" if ok else "FARKLI"))

            for group, norm in (result.get("normality") or {}).items():
                if norm.get("p") is None:
                    skipped += 1
                    continue

                data = [r[name] for r in rows if r[key] == group and r[name] is not None]
                sw_stat, sw_p = stats.shapiro(data)

                ok_w = norm["statistic"] == round(float(sw_stat), 4)
                ok_p, d_p = close(norm["p"], float(sw_p), SHAPIRO_P_TOLERANCE)
                diffs["Shapiro-Wilk p"].append(abs(norm["p"] - float(sw_p)))
                diffs["Shapiro-Wilk W"].append(abs(norm["statistic"] - float(sw_stat)))
                if not (ok_w and ok_p):
                    failed += 1
                    print("      Shapiro-Wilk %-12s FARKLI  W bizde %s scipy %s | p bagil fark %.1e"
                          % (group, norm["statistic"], round(float(sw_stat), 4), d_p))

    print("\nkarsilastirilan deger  : %d" % sum(len(v) for v in diffs.values()))
    print("test edilemeyen tablo  : %d" % skipped)
    print("olcute uymayan         : %d" % failed)
    print()
    for label, values in diffs.items():
        if not values:
            continue
        print("  %-16s n=%-3d en buyuk mutlak fark %.2e" % (label, len(values), max(values)))
    print("\nscipy %s | numpy %s" % (__import__("scipy").__version__, np.__version__))

    if failed:
        print("\nEN AZ BIR DEGER SCIPY ILE ESLESMIYOR")
        return 1
    print("\nbutun degerler scipy ile eslesiyor")
    return 0

if __name__ == "__main__":
    sys.exit(main())
