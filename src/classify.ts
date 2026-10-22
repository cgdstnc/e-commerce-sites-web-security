import { truncate } from "./utils/format.ts";

export type Signals = {
  title: string;
  html_lang: string;
  text_len: number;
  tr_lang_attr: boolean;
  tr_char_count: number;
  tr_stopwords: number;
  cart: number;
  buy: number;
  product: number;
  price: number;
  platform: number;
  shop_links: number;
  schema_product: boolean;
  parked: number;
  is_turkish: boolean;
  ecom_score: number;
  looks_parked: boolean;
};

const WORD_CHARS = "\\p{L}\\p{N}_";
const word = (pattern: string) =>
  new RegExp(`(?<![${WORD_CHARS}])(?:${pattern})(?![${WORD_CHARS}])`, "iu");

const CART = [
  /sepete ekle/i, /sepetim/i, /al[iı]şver[iı]ş sepeti/i, word("sepet"),
  /add to cart/i, word("shopping cart"),
];
const BUY = [
  /sat[iı]n al/i, /hemen al/i, /sipari[şs]i tamamla/i, /[öo]deme yap/i,
  word("checkout"), word("buy now"),
];
const PRODUCT = [
  word("[üu]r[üu]n"), word("[üu]r[üu]nler"), /stokta/i, word("indirim"),
  /kampanya/i, /kategoriler/i, /favorilerime ekle/i, /beden se[çc]/i,
];
const PRICE = [/₺/, new RegExp(`\\d[\\d.,]*\\s*TL(?![${WORD_CHARS}])`, "u"), word("KDV"), word("TRY")];
const PLATFORM = [
  /ticimax/i, /ideasoft/i, /t-soft/i, /tsoft/i, /shopify/i, /woocommerce/i,
  /magento/i, /opencart/i, /prestashop/i, /shopier/i, /ikas\.com/i, /platformum/i,
];
const SHOP_LINKS = [/href=["'][^"']*\/(sepet|cart|checkout|urun|[üu]r[üu]n|kategori|basket)[/"']/i];
const PARKED = [
  /alan ad[iı] sat[iı]l[iı]k/i, /domain for sale/i, /bu alan ad[iı] sat[iı]l[iı]k/i,
  /parked (domain|free)/i,
  /sedoparking/i, /bodis\.com/i, /afternic/i, /website coming soon/i,
  /[çc]ok yak[iı]nda/i, /yap[iı]m a[şs]amas[iı]nda/i,
];
const TR_STOPWORDS = [
  word("ve"), word("bir"), word("i[çc]in"), word("ile"), word("bu"), word("daha"),
  word("t[üu]m"), word("olarak"),
];

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_LANG = /<html[^>]*\blang=["']?([a-zA-Z-]+)/i;
const SCRIPT_OR_STYLE = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi;
const TAG = /<[^>]+>/g;
const WHITESPACE = /\s+/g;
const SCHEMA_PRODUCT = /schema\.org\/(Product|Offer)/i;
const OG_PRODUCT = /og:type["'][^>]*product/i;

const TURKISH_CHAR_THRESHOLD = 15;
const TURKISH_STOPWORD_THRESHOLD = 3;
const PARKED_TEXT_THRESHOLD = 200;

const NAMED_ENTITIES: Record<string, string> = {
  "&AElig;": "\u00c6", "&Aacute;": "\u00c1", "&Acirc;": "\u00c2", "&Agrave;": "\u00c0", "&Alpha;": "\u0391",
  "&Aring;": "\u00c5", "&Atilde;": "\u00c3", "&Auml;": "\u00c4", "&Beta;": "\u0392", "&Ccedil;": "\u00c7",
  "&Chi;": "\u03a7", "&Dagger;": "\u2021", "&Delta;": "\u0394", "&ETH;": "\u00d0", "&Eacute;": "\u00c9",
  "&Ecirc;": "\u00ca", "&Egrave;": "\u00c8", "&Epsilon;": "\u0395", "&Eta;": "\u0397", "&Euml;": "\u00cb",
  "&Gamma;": "\u0393", "&Iacute;": "\u00cd", "&Icirc;": "\u00ce", "&Igrave;": "\u00cc", "&Iota;": "\u0399",
  "&Iuml;": "\u00cf", "&Kappa;": "\u039a", "&Lambda;": "\u039b", "&Mu;": "\u039c", "&Ntilde;": "\u00d1",
  "&Nu;": "\u039d", "&OElig;": "\u0152", "&Oacute;": "\u00d3", "&Ocirc;": "\u00d4", "&Ograve;": "\u00d2",
  "&Omega;": "\u03a9", "&Omicron;": "\u039f", "&Oslash;": "\u00d8", "&Otilde;": "\u00d5", "&Ouml;": "\u00d6",
  "&Phi;": "\u03a6", "&Pi;": "\u03a0", "&Prime;": "\u2033", "&Psi;": "\u03a8", "&Rho;": "\u03a1",
  "&Scaron;": "\u0160", "&Sigma;": "\u03a3", "&THORN;": "\u00de", "&Tau;": "\u03a4", "&Theta;": "\u0398",
  "&Uacute;": "\u00da", "&Ucirc;": "\u00db", "&Ugrave;": "\u00d9", "&Upsilon;": "\u03a5", "&Uuml;": "\u00dc",
  "&Xi;": "\u039e", "&Yacute;": "\u00dd", "&Yuml;": "\u0178", "&Zeta;": "\u0396", "&aacute;": "\u00e1",
  "&acirc;": "\u00e2", "&acute;": "\u00b4", "&aelig;": "\u00e6", "&agrave;": "\u00e0", "&alefsym;": "\u2135",
  "&alpha;": "\u03b1", "&amp;": "&", "&and;": "\u2227", "&ang;": "\u2220", "&aring;": "\u00e5",
  "&asymp;": "\u2248", "&atilde;": "\u00e3", "&auml;": "\u00e4", "&bdquo;": "\u201e", "&beta;": "\u03b2",
  "&brvbar;": "\u00a6", "&bull;": "\u2022", "&cap;": "\u2229", "&ccedil;": "\u00e7", "&cedil;": "\u00b8",
  "&cent;": "\u00a2", "&chi;": "\u03c7", "&circ;": "\u02c6", "&clubs;": "\u2663", "&cong;": "\u2245",
  "&copy;": "\u00a9", "&crarr;": "\u21b5", "&cup;": "\u222a", "&curren;": "\u00a4", "&dArr;": "\u21d3",
  "&dagger;": "\u2020", "&darr;": "\u2193", "&deg;": "\u00b0", "&delta;": "\u03b4", "&diams;": "\u2666",
  "&divide;": "\u00f7", "&eacute;": "\u00e9", "&ecirc;": "\u00ea", "&egrave;": "\u00e8", "&empty;": "\u2205",
  "&emsp;": "\u2003", "&ensp;": "\u2002", "&epsilon;": "\u03b5", "&equiv;": "\u2261", "&eta;": "\u03b7",
  "&eth;": "\u00f0", "&euml;": "\u00eb", "&euro;": "\u20ac", "&exist;": "\u2203", "&fnof;": "\u0192",
  "&forall;": "\u2200", "&frac12;": "\u00bd", "&frac14;": "\u00bc", "&frac34;": "\u00be", "&frasl;": "\u2044",
  "&gamma;": "\u03b3", "&ge;": "\u2265", "&gt;": ">", "&hArr;": "\u21d4", "&harr;": "\u2194",
  "&hearts;": "\u2665", "&hellip;": "\u2026", "&iacute;": "\u00ed", "&icirc;": "\u00ee", "&iexcl;": "\u00a1",
  "&igrave;": "\u00ec", "&image;": "\u2111", "&infin;": "\u221e", "&int;": "\u222b", "&iota;": "\u03b9",
  "&iquest;": "\u00bf", "&isin;": "\u2208", "&iuml;": "\u00ef", "&kappa;": "\u03ba", "&lArr;": "\u21d0",
  "&lambda;": "\u03bb", "&lang;": "\u2329", "&laquo;": "\u00ab", "&larr;": "\u2190", "&lceil;": "\u2308",
  "&ldquo;": "\u201c", "&le;": "\u2264", "&lfloor;": "\u230a", "&lowast;": "\u2217", "&loz;": "\u25ca",
  "&lrm;": "\u200e", "&lsaquo;": "\u2039", "&lsquo;": "\u2018", "&lt;": "<", "&macr;": "\u00af",
  "&mdash;": "\u2014", "&micro;": "\u00b5", "&middot;": "\u00b7", "&minus;": "\u2212", "&mu;": "\u03bc",
  "&nabla;": "\u2207", "&nbsp;": "\u00a0", "&ndash;": "\u2013", "&ne;": "\u2260", "&ni;": "\u220b",
  "&not;": "\u00ac", "&notin;": "\u2209", "&nsub;": "\u2284", "&ntilde;": "\u00f1", "&nu;": "\u03bd",
  "&oacute;": "\u00f3", "&ocirc;": "\u00f4", "&oelig;": "\u0153", "&ograve;": "\u00f2", "&oline;": "\u203e",
  "&omega;": "\u03c9", "&omicron;": "\u03bf", "&oplus;": "\u2295", "&or;": "\u2228", "&ordf;": "\u00aa",
  "&ordm;": "\u00ba", "&oslash;": "\u00f8", "&otilde;": "\u00f5", "&otimes;": "\u2297", "&ouml;": "\u00f6",
  "&para;": "\u00b6", "&part;": "\u2202", "&permil;": "\u2030", "&perp;": "\u22a5", "&phi;": "\u03c6",
  "&pi;": "\u03c0", "&piv;": "\u03d6", "&plusmn;": "\u00b1", "&pound;": "\u00a3", "&prime;": "\u2032",
  "&prod;": "\u220f", "&prop;": "\u221d", "&psi;": "\u03c8", "&quot;": "\"", "&rArr;": "\u21d2",
  "&radic;": "\u221a", "&rang;": "\u232a", "&raquo;": "\u00bb", "&rarr;": "\u2192", "&rceil;": "\u2309",
  "&rdquo;": "\u201d", "&real;": "\u211c", "&reg;": "\u00ae", "&rfloor;": "\u230b", "&rho;": "\u03c1",
  "&rlm;": "\u200f", "&rsaquo;": "\u203a", "&rsquo;": "\u2019", "&sbquo;": "\u201a", "&scaron;": "\u0161",
  "&sdot;": "\u22c5", "&sect;": "\u00a7", "&shy;": "\u00ad", "&sigma;": "\u03c3", "&sigmaf;": "\u03c2",
  "&sim;": "\u223c", "&spades;": "\u2660", "&sub;": "\u2282", "&sube;": "\u2286", "&sum;": "\u2211",
  "&sup;": "\u2283", "&sup1;": "\u00b9", "&sup2;": "\u00b2", "&sup3;": "\u00b3", "&supe;": "\u2287",
  "&szlig;": "\u00df", "&tau;": "\u03c4", "&there4;": "\u2234", "&theta;": "\u03b8", "&thetasym;": "\u03d1",
  "&thinsp;": "\u2009", "&thorn;": "\u00fe", "&tilde;": "\u02dc", "&times;": "\u00d7", "&trade;": "\u2122",
  "&uArr;": "\u21d1", "&uacute;": "\u00fa", "&uarr;": "\u2191", "&ucirc;": "\u00fb", "&ugrave;": "\u00f9",
  "&uml;": "\u00a8", "&upsih;": "\u03d2", "&upsilon;": "\u03c5", "&uuml;": "\u00fc", "&weierp;": "\u2118",
  "&xi;": "\u03be", "&yacute;": "\u00fd", "&yen;": "\u00a5", "&yuml;": "\u00ff", "&zeta;": "\u03b6",
  "&zwj;": "\u200d", "&zwnj;": "\u200c",
};

function unescapeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, (entity) => NAMED_ENTITIES[entity] ?? entity);
}

function countMatching(patterns: RegExp[], text: string): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

export function classify(html: string): Signals {
  const visible = unescapeHtml(html.replace(SCRIPT_OR_STYLE, " ").replace(TAG, " ")).replace(
    WHITESPACE,
    " ",
  );
  const lowerVisible = visible.toLowerCase();
  const lowerHtml = html.toLowerCase();

  const titleMatch = TITLE.exec(html);
  const title = titleMatch
    ? truncate(unescapeHtml(titleMatch[1] ?? "").replace(WHITESPACE, " ").trim(), 160)
    : "";

  const langMatch = HTML_LANG.exec(html);
  const htmlLang = (langMatch?.[1] ?? "").toLowerCase();

  const trCharCount = visible.match(TR_CHARS)?.length ?? 0;
  const trStopwords = countMatching(TR_STOPWORDS, lowerVisible);

  const cart = countMatching(CART, lowerVisible);
  const buy = countMatching(BUY, lowerVisible);
  const product = countMatching(PRODUCT, lowerVisible);
  const price = countMatching(PRICE, visible);
  const platform = countMatching(PLATFORM, lowerHtml);
  const shopLinks = countMatching(SHOP_LINKS, lowerHtml);
  const schemaProduct = SCHEMA_PRODUCT.test(html) || OG_PRODUCT.test(html);
  const parked = countMatching(PARKED, lowerVisible);

  return {
    title,
    html_lang: htmlLang,
    text_len: visible.length,
    tr_lang_attr: htmlLang.startsWith("tr"),
    tr_char_count: trCharCount,
    tr_stopwords: trStopwords,
    cart,
    buy,
    product,
    price,
    platform,
    shop_links: shopLinks,
    schema_product: schemaProduct,
    parked,
    is_turkish:
      htmlLang.startsWith("tr") ||
      (trCharCount >= TURKISH_CHAR_THRESHOLD && trStopwords >= TURKISH_STOPWORD_THRESHOLD),
    ecom_score:
      cart * 3 +
      buy * 2 +
      shopLinks * 2 +
      platform * 2 +
      product +
      Math.min(price, 3) +
      (schemaProduct ? 2 : 0),
    looks_parked: parked >= 1 || visible.length < PARKED_TEXT_THRESHOLD,
  };
}
