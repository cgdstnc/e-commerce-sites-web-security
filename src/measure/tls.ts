import tls from "node:tls";
import { LIMITS } from "../ethics.ts";

const PORT = 443;
const HANDSHAKE_TIMEOUT_MS = 10_000;

const LEGACY_CIPHERS = "DEFAULT:@SECLEVEL=0";

const PROBED_VERSIONS: Array<[string, tls.SecureVersion, string | undefined]> = [
  ["TLSv1.0", "TLSv1", LEGACY_CIPHERS],
  ["TLSv1.1", "TLSv1.1", LEGACY_CIPHERS],
  ["TLSv1.2", "TLSv1.2", undefined],
  ["TLSv1.3", "TLSv1.3", undefined],
];

const WEAK_TESTABLE = ["NULL", "aNULL", "ADH", "AECDH", "MD5", "SEED"];
const WEAK_UNTESTABLE = ["RC4", "DES", "3DES", "IDEA", "EXPORT", "RC2"];
const WEAK_CIPHER_SPEC = "NULL:aNULL:ADH:AECDH:MD5:SEED:@SECLEVEL=0";
const WEAK_NAME_PATTERNS = ["NULL", "ADH", "AECDH", "MD5", "SEED", "-DES-", "RC4"];

type Handshake = {
  version: string | null;
  cipher: string | null;
  certificate: tls.DetailedPeerCertificate | null;

  authorized: boolean;
  authorizationError: string | null;

  error: string | null;
};

function connect(host: string, options: tls.ConnectionOptions): Promise<Handshake> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host, port: PORT, servername: host, timeout: HANDSHAKE_TIMEOUT_MS, ...options },
      () => {
        const result: Handshake = {
          version: socket.getProtocol(),
          cipher: socket.getCipher()?.name ?? null,
          certificate: socket.getPeerCertificate(true),
          authorized: socket.authorized,
          authorizationError: socket.authorized
            ? null
            : (socket.authorizationError?.toString() ?? null),
          error: null,
        };
        socket.destroy();
        resolve(result);
      },
    );

    const fail = (error: string) => {
      socket.destroy();
      resolve({
        version: null,
        cipher: null,
        certificate: null,
        authorized: false,
        authorizationError: null,
        error,
      });
    };

    socket.on("error", (error: NodeJS.ErrnoException) => fail(error.code ?? error.message));
    socket.on("timeout", () => fail("timeout"));
  });
}

export type TlsMetrics = Record<string, unknown>;

export async function measureTls(host: string, measuredAt: Date, pace: () => Promise<void>) {
  await pace();
  const handshake = await connect(host, { rejectUnauthorized: false, minVersion: "TLSv1" });

  if (handshake.error !== null) {
    return {
      tls_negotiated_version: null,
      tls_cert_issuer: null,
      tls_cert_issuer_type: null,
      tls_cert_valid_days_remaining: null,
      tls_cert_valid_now: null,
      tls_cert_hostname_match: null,
      tls_chain_length: null,
      tls_verify_error: handshake.error,
      tls_reachable: false,
      ...unprobed(),
    };
  }

  const trusted = handshake.authorized;
  const metrics: TlsMetrics = {
    tls_reachable: true,
    tls_negotiated_version: handshake.version,
    tls_verify_error: trusted ? null : `verify:${handshake.authorizationError ?? "unknown"}`,
    ...describeCertificate(handshake, measuredAt),
  };

  if (trusted) {
    metrics["tls_cert_valid_now"] = true;
    metrics["tls_cert_hostname_match"] = true;
  } else {
    Object.assign(metrics, interpretVerifyError(handshake.authorizationError ?? ""));
  }

  const versions = await probeVersions(host, pace);
  const weak = await probeWeakCiphers(host, pace);

  return { ...metrics, ...versions, ...weak, tls_weak_cipher_spec: WEAK_CIPHER_SPEC };
}

function unprobed() {
  return {
    tls_protocol_versions_supported: null,
    tls_version_probe_errors: null,
    tls_weak_cipher_present: null,
    tls_weak_cipher_negotiated: null,
    tls_weak_families_tested: WEAK_TESTABLE,
    tls_weak_families_untestable: WEAK_UNTESTABLE,
    tls_weak_cipher_spec: WEAK_CIPHER_SPEC,
  };
}

async function probeVersions(host: string, pace: () => Promise<void>) {
  const supported: string[] = [];
  const errors: Record<string, string> = {};

  for (const [label, version, ciphers] of PROBED_VERSIONS) {
    await pace();
    const result = await connect(host, {
      rejectUnauthorized: false,
      minVersion: version,
      maxVersion: version,
      ...(ciphers ? { ciphers } : {}),
    });

    if (result.error === null) supported.push(label);
    else errors[label] = result.error.slice(0, 70);
  }

  return {
    tls_protocol_versions_supported: supported.length > 0 ? supported : null,
    tls_version_probe_errors: Object.keys(errors).length > 0 ? errors : null,
  };
}

async function probeWeakCiphers(host: string, pace: () => Promise<void>) {
  await pace();

  const result = await connect(host, {
    rejectUnauthorized: false,
    maxVersion: "TLSv1.2",
    ciphers: WEAK_CIPHER_SPEC,
  });

  if (result.error !== null) {
    const refused = !isNetworkError(result.error) && result.error !== "timeout";
    return {
      tls_weak_cipher_present: refused ? false : null,
      tls_weak_cipher_negotiated: null,
      tls_weak_families_tested: WEAK_TESTABLE,
      tls_weak_families_untestable: WEAK_UNTESTABLE,
    };
  }

  if (result.cipher === null) {
    return {
      tls_weak_cipher_present: null,
      tls_weak_cipher_negotiated: null,
      tls_weak_families_tested: WEAK_TESTABLE,
      tls_weak_families_untestable: WEAK_UNTESTABLE,
    };
  }

  const weak = WEAK_NAME_PATTERNS.some((pattern) =>
    result.cipher!.toLowerCase().includes(pattern.toLowerCase()),
  );

  return {
    tls_weak_cipher_present: weak,
    tls_weak_cipher_negotiated: weak ? result.cipher : null,
    tls_weak_families_tested: WEAK_TESTABLE,
    tls_weak_families_untestable: WEAK_UNTESTABLE,
  };
}

function describeCertificate(handshake: Handshake, measuredAt: Date) {
  const certificate = handshake.certificate;
  if (!certificate || Object.keys(certificate).length === 0) return {};

  const organisation = certificate.issuer?.["O"];
  const issuerOrg = Array.isArray(organisation) ? (organisation[0] ?? null) : (organisation ?? null);
  const selfSigned =
    JSON.stringify(certificate.issuer ?? {}) === JSON.stringify(certificate.subject ?? {});

  const notBefore = Date.parse(certificate.valid_from);
  const notAfter = Date.parse(certificate.valid_to);
  const dayMs = 86_400_000;

  return {
    tls_cert_issuer: issuerOrg,
    tls_cert_issuer_type: classifyIssuer(issuerOrg, selfSigned),
    tls_cert_valid_days_remaining: Number.isNaN(notAfter)
      ? null
      : Math.floor((notAfter - measuredAt.getTime()) / dayMs),
    tls_cert_valid_now:
      Number.isNaN(notBefore) || Number.isNaN(notAfter)
        ? null
        : notBefore <= measuredAt.getTime() && measuredAt.getTime() <= notAfter,
    tls_chain_length: chainLength(certificate),
  };
}

function chainLength(certificate: tls.DetailedPeerCertificate): number | null {
  let length = 0;
  let current: tls.DetailedPeerCertificate | undefined = certificate;
  const seen = new Set<tls.DetailedPeerCertificate>();

  while (current && !seen.has(current)) {
    seen.add(current);
    length++;
    current = current.issuerCertificate;
  }
  return length > 0 ? length : null;
}

function classifyIssuer(issuerOrg: string | null, selfSigned: boolean): string | null {
  if (selfSigned) return "self_signed";
  if (!issuerOrg) return null;

  const lowered = issuerOrg.toLowerCase();
  const letsEncrypt = lowered.includes("let's encrypt") || lowered.includes("lets encrypt");
  return letsEncrypt ? "lets_encrypt" : "commercial";
}

function interpretVerifyError(error: string) {
  const lowered = error.toLowerCase();

  if (lowered.includes("hostname") || lowered.includes("altname") || lowered.includes("common name")) {
    return { tls_cert_hostname_match: false };
  }
  if (lowered.includes("expired")) {
    return { tls_cert_hostname_match: null, tls_cert_valid_now: false };
  }
  return {};
}

function isNetworkError(error: string): boolean {
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "EHOSTUNREACH", "ETIMEDOUT"]
    .includes(error);
}

export const TLS_LIMITS = { handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS, perSiteGapMs: LIMITS.perSiteGapMs };
