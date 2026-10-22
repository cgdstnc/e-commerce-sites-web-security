export function round(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;

  const negative = value < 0;
  const expansion = Math.abs(value).toFixed(Math.min(100, digits + 25));
  const [whole = "0", fraction = ""] = expansion.split(".");

  const kept = BigInt(whole + fraction.slice(0, digits).padEnd(digits, "0"));
  const dropped = fraction.slice(digits);

  const result = kept + (roundsUp(dropped, kept) ? 1n : 0n);
  const scaled = Number(result) / 10 ** digits;

  return negative ? -scaled : scaled;
}

function roundsUp(dropped: string, kept: bigint): boolean {
  const first = dropped[0] ?? "0";
  if (first < "5") return false;
  if (first > "5") return true;

  const hasRemainder = /[1-9]/.test(dropped.slice(1));
  return hasRemainder || kept % 2n === 1n;
}
