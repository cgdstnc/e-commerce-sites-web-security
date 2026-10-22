export const UNRANKED = Number.MAX_SAFE_INTEGER;

export function byRank(a: number | null, b: number | null): number {
  return (a ?? UNRANKED) - (b ?? UNRANKED);
}

export function byDomain(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
