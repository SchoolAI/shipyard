import { describe, expect, it } from 'vitest';
import { type FrecencyEntry, frecencyScore, pruneStaleEntries, recordAccess } from './frecency';

const HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;

describe('frecencyScore', () => {
  it('returns 0 for empty timestamps', () => {
    const entry: FrecencyEntry = { id: 'a', timestamps: [] };
    expect(frecencyScore(entry, Date.now())).toBe(0);
  });

  it('returns ~1 for single access just now', () => {
    const now = Date.now();
    const entry: FrecencyEntry = { id: 'a', timestamps: [now] };
    expect(frecencyScore(entry, now)).toBeCloseTo(1, 5);
  });

  it('decays to ~0.5 after one half-life (3 days)', () => {
    const now = Date.now();
    const entry: FrecencyEntry = { id: 'a', timestamps: [now - HALF_LIFE_MS] };
    expect(frecencyScore(entry, now)).toBeCloseTo(0.5, 5);
  });

  it('accumulates for multiple accesses', () => {
    const now = Date.now();
    const single: FrecencyEntry = { id: 'a', timestamps: [now] };
    const double: FrecencyEntry = { id: 'b', timestamps: [now, now] };
    expect(frecencyScore(double, now)).toBeGreaterThan(frecencyScore(single, now));
  });
});

describe('recordAccess', () => {
  it('creates new entry when none exists', () => {
    const now = Date.now();
    const entry = recordAccess(undefined, 'new-id', now);
    expect(entry.id).toBe('new-id');
    expect(entry.timestamps).toEqual([now]);
  });

  it('appends to existing timestamps', () => {
    const now = Date.now();
    const existing: FrecencyEntry = { id: 'a', timestamps: [now - 1000] };
    const updated = recordAccess(existing, 'a', now);
    expect(updated.timestamps).toEqual([now - 1000, now]);
  });

  it('caps at maxTimestamps', () => {
    const now = Date.now();
    const existing: FrecencyEntry = {
      id: 'a',
      timestamps: [1, 2, 3],
    };
    const updated = recordAccess(existing, 'a', now, 3);
    expect(updated.timestamps).toHaveLength(3);
    expect(updated.timestamps).toEqual([2, 3, now]);
  });
});

describe('pruneStaleEntries', () => {
  it('removes entries below threshold', () => {
    const now = Date.now();
    const ancient = now - HALF_LIFE_MS * 30; // ~30 half-lives, score near 0
    const entries: Record<string, FrecencyEntry> = {
      stale: { id: 'stale', timestamps: [ancient] },
      recent: { id: 'recent', timestamps: [now] },
    };
    const pruned = pruneStaleEntries(entries, now);
    expect(pruned.stale).toBeUndefined();
    expect(pruned.recent).toBeDefined();
  });

  it('keeps recent entries', () => {
    const now = Date.now();
    const entries: Record<string, FrecencyEntry> = {
      a: { id: 'a', timestamps: [now] },
      b: { id: 'b', timestamps: [now - 1000] },
    };
    const pruned = pruneStaleEntries(entries, now);
    expect(Object.keys(pruned)).toHaveLength(2);
  });
});
