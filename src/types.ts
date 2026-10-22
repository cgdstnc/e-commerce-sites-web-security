export type Stratum = "A_buyuk" | "B_orta" | "C_kucuk";

export type TrancoTrRow = {
  tranco_rank: number;
  domain: string;
  public_suffix: string;
};

export type CandidateRow = {
  domain: string;
  source: "both" | "tranco_tr" | "crux_tr";
  tranco_rank: number | null;

  crux_best_bucket: number | null;
  crux_origin_count: number;
  is_tr_tld: boolean;
};

export type CrawlRow = {
  domain: string;
  stratum: Stratum;
  crux_best_bucket: number;
  tranco_rank: number | null;
  source: string;
  is_tr_tld: boolean;
};
