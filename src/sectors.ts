export type Sector = "moda" | "elektronik" | "kozmetik" | "mobilya" | "market" | "diger";

const TURKISH_TO_ASCII: Record<string, string> = {
  ı: "i", İ: "i", I: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g",
  ç: "c", Ç: "c", ö: "o", Ö: "o", ü: "u", Ü: "u",
};

export function fold(text: string | null | undefined): string {
  const mapped = (text ?? "").replace(/[ıİIşŞğĞçÇöÖüÜ]/g, (char) => TURKISH_TO_ASCII[char] ?? char);
  return mapped
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x00-\x7f]/g, "");
}

const KEYWORDS: Array<[Sector, string[]]> = [
  ["moda", ["giyim", "moda", "ayakkab", "canta", "tekstil", "elbise", "tesettur", "mayo", "sapka",
    "aksesuar", "butik", "jean", "gomlek", "taki", "mucevher", "jewel", "saat", "gozluk",
    "ic giyim", "corap", "deri"]],
  ["elektronik", ["elektronik", "bilgisayar", "teknoloji", "telefon", "laptop", "bilisim", "gaming",
    "oyuncu", "kamera", "televizyon", "beyaz esya", "klima", "ankastre", "tablet", "kulaklik"]],
  ["kozmetik", ["kozmetik", "bakim", "parfum", "makyaj", "cilt", "sac", "guzellik", "dermo",
    "sampuan", "oje"]],
  ["mobilya", ["mobilya", "dekorasyon", "dekor", "ev tekstil", "hali", "perde", "aydinlatma",
    "bahce", "mutfak", "yatak", "koltuk", "avize", "duvar kagidi"]],
  ["market", ["market", "gida", "bakkal", "supermarket", "kuruyemis", "kahve", "cay", "organik",
    "et urun", "sarkuteri", "icecek", "bakliyat", "zeytin", "bal"]],
];

export type SectorGuess = { sector: Sector; keywords: string };

export function guessSector(domain: string, title: string | null | undefined): SectorGuess {
  const haystack = `${fold(domain)} ${fold(title)}`;

  const hits = KEYWORDS.map(([sector, keywords]) => ({
    sector,
    matched: keywords.filter((keyword) => haystack.includes(keyword)),
  })).filter((hit) => hit.matched.length > 0);

  if (hits.length === 0) return { sector: "diger", keywords: "" };

  const best = Math.max(...hits.map((hit) => hit.matched.length));
  const winner = hits.find((hit) => hit.matched.length === best);

  return { sector: winner?.sector ?? "diger", keywords: winner?.matched.slice(0, 4).join(";") ?? "" };
}
