import dns from "node:dns/promises";

export const LIMITS = {
  concurrency: 5,
  perSiteGapMs: 1000,
  maxAttempts: 2,
  retryGapMs: 5000,
  requestDeadlineMs: 30_000,
  maxRedirects: 10,
  domainDeadlineMs: 60_000,
  maxBodyBytes: 400_000,
  allowedPaths: ["/robots.txt", "/", "/.well-known/security.txt"],
};

export const MEASUREMENT_LIMITS = {
  ...LIMITS,
  maxBodyBytes: 600_000,
  domainDeadlineMs: 180_000,
};

export function userAgent(): string {
  const contact = process.env["RESEARCH_CONTACT"];
  if (!contact) {
    throw new Error(
      "RESEARCH_CONTACT is not set. The ethical rules require a User-Agent that " +
        "says who we are:\n  RESEARCH_CONTACT=name@C03513 node src/main.ts <step>",
    );
  }
  return (
    `Mozilla/5.0 (compatible; EticaretGuvenlikArastirmasi/1.0; +mailto:${contact}) ` +
    "academic-research passive-measurement"
  );
}

export function pacer() {
  let gap = LIMITS.perSiteGapMs;
  let lastEnd = 0;

  return {
    requireGap(seconds: number | null) {
      if (seconds) gap = Math.max(gap, seconds * 1000);
    },

    async wait() {
      const remaining = lastEnd === 0 ? 0 : gap - (Date.now() - lastEnd);
      if (remaining > 0) await sleep(remaining);
    },

    mark() {
      lastEnd = Date.now();
    },

    async takeTurn() {
      await this.wait();
      this.mark();
    },
  };
}

export type Pacer = ReturnType<typeof pacer>;

export type RequestLogEntry = {
  ts: string;
  domain: string;
  kind: string;
  url: string;
  attempt: number;
  hop?: number;
  status?: number;
  ms?: number;
  bytes?: number;
  final_url?: string;
  error?: string;
  dns_dead?: boolean;
};

export type Response = {
  status: number;
  headers: Headers;
  finalUrl: string;
  body: Uint8Array;

  chain: Array<{ url: string; status: number }>;

  setCookies: string[];
};

export type Failure = "dns_dead" | "rate_limited" | "path_not_allowed" | "error";

export type Outcome =
  | { ok: true; response: Response }
  | { ok: false; reason: Failure; note: string };

export async function guardedGet(
  url: string,
  domain: string,
  kind: string,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
  limits: typeof LIMITS = LIMITS,
): Promise<Outcome> {
  const requestPath = new URL(url).pathname;
  if (!limits.allowedPaths.includes(requestPath)) {
    return { ok: false, reason: "path_not_allowed", note: requestPath };
  }

  const chain: Array<{ url: string; status: number }> = [];
  const cookies = new Map<string, string>();
  let target = url;

  for (let hop = 0; hop <= limits.maxRedirects; hop++) {
    const outcome = await singleGet(target, domain, kind, hop, limiter, log, limits);
    if (!outcome.ok) return outcome;

    for (const cookie of outcome.response.headers.getSetCookie()) {
      cookies.set(cookieName(cookie), cookie);
    }

    const location = outcome.response.headers.get("location");
    const redirecting = outcome.response.status >= 300 && outcome.response.status < 400 && location;

    if (!redirecting) {
      return {
        ok: true,
        response: { ...outcome.response, chain, setCookies: [...cookies.values()] },
      };
    }

    chain.push({ url: target, status: outcome.response.status });
    target = new URL(location, target).toString();
  }

  return { ok: false, reason: "error", note: `too_many_redirects(${limits.maxRedirects})` };
}

function cookieName(setCookie: string): string {
  return setCookie.split(";")[0]!.split("=")[0]!.trim().toLowerCase();
}

async function singleGet(
  url: string,
  domain: string,
  kind: string,
  hop: number,
  limiter: Pacer,
  log: (entry: RequestLogEntry) => void,
  limits: typeof LIMITS,
): Promise<Outcome> {
  let lastError = "unknown";

  for (let attempt = 0; attempt < limits.maxAttempts; attempt++) {
    await limiter.wait();
    const started = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent(),
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Language": "tr,en;q=0.7",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(limits.requestDeadlineMs),
      });

      const body = await readCapped(response, limits.maxBodyBytes);
      limiter.mark();

      log({
        ts: new Date().toISOString(),
        domain,
        kind,
        url,
        attempt,
        hop,
        status: response.status,
        ms: Date.now() - started,
        bytes: body.length,
        final_url: url,
      });

      if (response.status === 429 || response.status === 503) {
        return { ok: false, reason: "rate_limited", note: `rate_limited_${response.status}` };
      }

      return {
        ok: true,
        response: {
          status: response.status,
          headers: response.headers,
          finalUrl: url,
          body,
          chain: [],
          setCookies: [],
        },
      };
    } catch (error) {
      limiter.mark();
      lastError = describeError(error);
      const dead = await resolutionFails(error, domain);

      log({
        ts: new Date().toISOString(),
        domain,
        kind,
        url,
        attempt,
        hop,
        error: lastError,
        dns_dead: dead,
      });

      if (dead) return { ok: false, reason: "dns_dead", note: "dns_dead" };
      if (attempt + 1 < limits.maxAttempts) await sleep(limits.retryGapMs);
    }
  }

  return { ok: false, reason: "error", note: lastError };
}

async function readCapped(response: globalThis.Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for await (const chunk of response.body) {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= maxBytes) break;
    }
  } catch {
  }

  return Buffer.concat(chunks, Math.min(total, maxBytes));
}

const DNS_ERROR_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);

async function resolutionFails(error: unknown, domain: string): Promise<boolean> {
  const code = errorCode(error);
  if (!code || !DNS_ERROR_CODES.has(code)) return false;

  try {
    await dns.lookup(domain);
    return false;
  } catch {
    return true;
  }
}

function errorCode(error: unknown): string | null {
  const cause = error instanceof Error ? error.cause : null;
  if (cause instanceof Error && "code" in cause) return String(cause.code);
  if (error instanceof Error && "code" in error) return String(error.code);
  return null;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  const code = errorCode(error);
  return code ? `${error.name}(${code})` : error.name;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
