import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyScore } from './fuzzy-match';

describe('fuzzyMatch', () => {
  it('matches empty query against anything', () => {
    expect(fuzzyMatch('', 'hello')).toBe(true);
  });

  it('matches exact substring', () => {
    expect(fuzzyMatch('opus', 'Claude Opus 4.6')).toBe(true);
  });

  it('matches fuzzy subsequence', () => {
    expect(fuzzyMatch('op46', 'Claude Opus 4.6')).toBe(true);
  });

  it('matches version numbers', () => {
    expect(fuzzyMatch('4.6', 'Claude Opus 4.6')).toBe(true);
    expect(fuzzyMatch('4.5', 'Claude Sonnet 4.5')).toBe(true);
  });

  it('rejects non-matching query', () => {
    expect(fuzzyMatch('xyz', 'Claude Opus 4.6')).toBe(false);
  });

  it('rejects query longer than target', () => {
    expect(fuzzyMatch('abcdef', 'abc')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('OPUS', 'claude opus 4.6')).toBe(true);
  });
});

describe('fuzzyScore', () => {
  it('scores exact prefix higher than mid-string match', () => {
    const prefix = fuzzyScore('cl', 'Claude Opus');
    const mid = fuzzyScore('cl', 'reclaim');
    expect(prefix).toBeGreaterThan(mid);
  });

  it('scores consecutive matches higher than scattered', () => {
    const consecutive = fuzzyScore('opus', 'Claude Opus 4.6');
    const scattered = fuzzyScore('opus', 'Opal purple sunset');
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it('scores word boundary matches higher', () => {
    const boundary = fuzzyScore('co', 'Clear output');
    const nonBoundary = fuzzyScore('co', 'bacon');
    expect(boundary).toBeGreaterThan(nonBoundary);
  });

  it('returns -1 for no match', () => {
    expect(fuzzyScore('xyz', 'hello')).toBe(-1);
  });
});
