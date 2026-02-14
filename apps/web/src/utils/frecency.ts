const HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;

export interface FrecencyEntry {
  id: string;
  timestamps: number[];
}

export function frecencyScore(entry: FrecencyEntry, now: number): number {
  let score = 0;
  for (const ts of entry.timestamps) {
    const age = now - ts;
    score += 2 ** (-age / HALF_LIFE_MS);
  }
  return score;
}

export function recordAccess(
  entry: FrecencyEntry | undefined,
  id: string,
  now: number,
  maxTimestamps = 10
): FrecencyEntry {
  const timestamps = entry ? [...entry.timestamps, now] : [now];
  return { id, timestamps: timestamps.slice(-maxTimestamps) };
}

export function pruneStaleEntries(
  entries: Record<string, FrecencyEntry>,
  now: number,
  threshold = 0.01
): Record<string, FrecencyEntry> {
  const result: Record<string, FrecencyEntry> = {};
  for (const [id, entry] of Object.entries(entries)) {
    if (frecencyScore(entry, now) >= threshold) {
      result[id] = entry;
    }
  }
  return result;
}
