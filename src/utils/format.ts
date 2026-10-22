export function num(value: number): string {
  return value.toLocaleString("tr-TR");
}

export function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    const group = key(row);
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return counts;
}

export function byCountDescending(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).sort(([aKey, a], [bKey, b]) => b - a || aKey.localeCompare(bKey));
}

export function formatCounts(counts: Record<string, number>): string {
  return byCountDescending(counts)
    .map(([key, count]) => `${key}=${num(count)}`)
    .join("  ");
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function truncate(text: string, maxCodePoints: number): string {
  return Array.from(text).slice(0, maxCodePoints).join("");
}
