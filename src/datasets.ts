import path from "node:path";
import { RAW } from "./utils/paths.ts";

export type Dataset = {
  file: string;
  sha256: string;
  provenance: Record<string, unknown>;

  fetchElsewhere?: true;
};

export const TRANCO: Dataset = {
  file: path.join(RAW, "tranco_Y8YJG_2026-09-26.csv"),
  sha256: "071ac7c36da7a7c10f8b415b1ab946d5d07088c55a789fc5ab38c76ad41da5fe",
  provenance: {
    list_id: "Y8YJG",
    list_date: "2026-09-26",
    permalink: "https://tranco-list.eu/list/Y8YJG/1000000",
    download: "curl -L https://tranco-list.eu/download/Y8YJG/1000000",
    configuration: {
      providers: ["crux", "farsight", "majestic", "radar", "umbrella"],
      combinationMethod: "dowdall",
      filterPLD: "on",
      startDate: "2026-08-28",
      endDate: "2026-09-26",
    },
    format: "rank,domain - no header row, CRLF line endings",
  },
  fetchElsewhere: true,
};

export const CRUX: Dataset = {
  file: path.join(RAW, "crux_tr_202608.csv.gz"),
  sha256: "a5a154881172f12fc6f5420c260adf67117ee6b23e5f97bf52163662c80aba61",
  provenance: {
    month: "2026-08",
    country: "tr",
    origin: "https://github.com/zakird/crux-top-lists (data/country/tr/202608.csv.gz)",
    format: "origin,rank - has a header row, origin is a full URL",
    note: "CrUX gives buckets (1000, 5000, 10000, 50000, 100000, 500000), not exact ranks.",
  },
  fetchElsewhere: true,
};

export const CLASSIFICATION: Dataset = {
  file: path.join(RAW, "classification_20260928.jsonl"),
  sha256: "9281c093e70c6e0e03a23b1d7abcea42ee40edbcb897924dd73d7127c34776bd",
  provenance: {
    produced_by: "03b - passive classification crawl",
    scanned: "2026-09-28 05:59 - 13:23 UTC (7.4 hours)",
    rows: 15618,
    format: "JSONL, one record per domain",
    note: "the HTML was not kept, only the signals we derived from it and <title>.",
  },
};

export const REQUEST_LOG: Dataset = {
  file: path.join(RAW, "request_log_20260928.jsonl"),
  sha256: "bf5322f247480a5bccfde6d5266878177c5eabe3f5b470cc066296cc1d0c8e9e",
  provenance: {
    produced_by: "03b - passive classification crawl",
    rows: 43499,
    format: "JSONL, one record per request (timestamp, status, duration, bytes)",
  },
};

export const REVIEW_TABLE: Dataset = {
  file: path.join(RAW, "sample_frame_review.csv"),
  sha256: "5b7e183f3c94d1ab05139f877e3bc1622a8b5176ac2e433f53bba194f1d6e37c",
  provenance: {
    produced_by: "3e-3g - evidence extraction plus checking in a browser",
    rows: 405,
    note: "the suggestion and manual_verified columns hold human decisions; the records are in manual_decisions/.",
  },
};

export const BLOCKED_SHORTLIST: Dataset = {
  file: path.join(RAW, "manual_review_blocked_shortlist.csv"),
  sha256: "85e5bd2405f27ccd8c8132d781b57ba3ccc74b0ef0ccc2dc258823028b102ab7",
  provenance: { produced_by: "3d plus checking in a browser", rows: 35, decided: "23 yes, 9 no, 3 unresolved" },
};

export const SOFTWALL_SHORTLIST: Dataset = {
  file: path.join(RAW, "manual_review_softwall_shortlist.csv"),
  sha256: "f015d2fc29d01ccc9dd49accfb68d483edc6f4f27036d4584e42b907128d434b",
  provenance: {
    produced_by: "the soft-wall rule plus checking in a browser",
    rows: 22,
    decided: "1 yes, 21 no",
    date: "2026-10-11",
  },
};

export const MEASUREMENTS: Dataset = {
  file: path.join(RAW, "measurements_20261010.jsonl"),
  sha256: "02b40f55154961fb216d3a1cf5adb9c1bb241a946f13479985d8fdf80ab5956a",
  provenance: {
    produced_by: "04 - security measurement",
    measured: "2026-10-10 (S380 joined the frame on 2026-10-11 and was measured that day)",
    rows: 426,
    supersedes: "measurements_20260929.jsonl (its cookie observation was wrong)",
  },
};

export const MEASUREMENT_REQUEST_LOG: Dataset = {
  file: path.join(RAW, "measurement_request_log_20261010.jsonl"),
  sha256: "c85e48dd6d5c96765a4351668cf03d83112a8a6bf129e6a0fc371ece58d7cf84",
  provenance: {
    produced_by: "04 - security measurement",
    rows: 3066,
    note: "every redirect hop is its own record, and the rate limit applied between hops too.",
  },
};

export const HSTS_PRELOAD: Dataset = {
  file: path.join(RAW, "hsts_preload_20260929.json"),
  sha256: "9fce8de4f5962bb3c02b6a04f6da6cae050edc404191ab96913f776ea47f3671",
  provenance: { source: "Chromium transport_security_state_static.json", fetched: "2026-09-29" },
  fetchElsewhere: true,
};

export const ALL_DATASETS = [
  TRANCO,
  CRUX,
  CLASSIFICATION,
  REQUEST_LOG,
  REVIEW_TABLE,
  BLOCKED_SHORTLIST,
  SOFTWALL_SHORTLIST,
  MEASUREMENTS,
  MEASUREMENT_REQUEST_LOG,
  HSTS_PRELOAD,
];
