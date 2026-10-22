const MULTI_LABEL_SUFFIXES = new Set([
  "com.tr", "gov.tr", "edu.tr", "org.tr", "net.tr", "bel.tr", "gen.tr", "web.tr", "av.tr",
  "k12.tr", "name.tr", "kep.tr", "tsk.tr", "pol.tr", "bbs.tr", "dr.tr", "biz.tr", "info.tr",
  "co.uk", "org.uk", "com.au", "co.jp", "com.br", "com.cn", "com.ru",
]);

const TRAILING_DOTS = /\.+$/;
const WWW_PREFIX = "www.";

export function publicSuffix(domain: string): string {
  const labels = domain.split(".");
  if (labels.length >= 3 && MULTI_LABEL_SUFFIXES.has(labels.slice(-2).join("."))) {
    return labels.slice(-2).join(".");
  }
  return labels[labels.length - 1] ?? "";
}

export function registrableDomain(host: string | null): string | null {
  if (!host) return null;

  let name = host.toLowerCase().trim().replace(TRAILING_DOTS, "");
  if (name.startsWith(WWW_PREFIX)) name = name.slice(WWW_PREFIX.length);

  const labels = name.split(".");
  if (labels.length < 2) return null;

  if (MULTI_LABEL_SUFFIXES.has(labels.slice(-2).join("."))) {
    return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  }
  return labels.slice(-2).join(".");
}

const SCHEME_SEPARATOR = "://";
const AUTHORITY_END = /[/?#]/;
const IPV6_OPEN = "[";
const IPV6_CLOSE = "]";
const USERINFO_SEPARATOR = "@";
const PORT_SEPARATOR = ":";

export function hostFromOrigin(origin: string): string | null {
  const schemeEnd = origin.indexOf(SCHEME_SEPARATOR);
  if (schemeEnd < 0) return null;

  let authority = origin.slice(schemeEnd + SCHEME_SEPARATOR.length);

  const authorityEnd = authority.search(AUTHORITY_END);
  if (authorityEnd >= 0) authority = authority.slice(0, authorityEnd);

  const userInfoEnd = authority.lastIndexOf(USERINFO_SEPARATOR);
  if (userInfoEnd >= 0) authority = authority.slice(userInfoEnd + 1);

  if (authority.startsWith(IPV6_OPEN)) {
    const close = authority.indexOf(IPV6_CLOSE);
    return close < 0 ? null : authority.slice(1, close).toLowerCase();
  }

  const portStart = authority.indexOf(PORT_SEPARATOR);
  if (portStart >= 0) authority = authority.slice(0, portStart);

  return authority === "" ? null : authority.toLowerCase();
}
