import { describe, expect, it } from 'vitest';
import { isValidYDocKey, YDOC_KEYS, type YDocKey } from './yjs-keys.js';

describe('YDOC_KEYS', () => {
  it('should export all expected keys', () => {
    expect(YDOC_KEYS).toEqual({
      METADATA: 'metadata',
      DOCUMENT_FRAGMENT: 'document',
      THREADS: 'threads',
      STEP_COMPLETIONS: 'stepCompletions',
      PLANS: 'plans',
      ARTIFACTS: 'artifacts',
      DELIVERABLES: 'deliverables',
      PRESENCE: 'presence',
      LINKED_PRS: 'linkedPRs',
      PR_REVIEW_COMMENTS: 'prReviewComments',
      TRANSCRIPT: 'transcript',
    });
  });

  it('should have unique values', () => {
    const values = Object.values(YDOC_KEYS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('should be type-safe', () => {
    // This is a compile-time test - if it compiles, it passes
    const key: YDocKey = YDOC_KEYS.METADATA;
    expect(key).toBe('metadata');
  });
});

describe('isValidYDocKey', () => {
  it('should return true for all YDOC_KEYS values', () => {
    expect(isValidYDocKey('metadata')).toBe(true);
    expect(isValidYDocKey('document')).toBe(true);
    expect(isValidYDocKey('threads')).toBe(true);
    expect(isValidYDocKey('stepCompletions')).toBe(true);
    expect(isValidYDocKey('plans')).toBe(true);
    expect(isValidYDocKey('artifacts')).toBe(true);
    expect(isValidYDocKey('deliverables')).toBe(true);
    expect(isValidYDocKey('presence')).toBe(true);
    expect(isValidYDocKey('linkedPRs')).toBe(true);
    expect(isValidYDocKey('prReviewComments')).toBe(true);
    expect(isValidYDocKey('transcript')).toBe(true);
  });

  it('should return false for unknown keys', () => {
    expect(isValidYDocKey('unknown')).toBe(false);
    expect(isValidYDocKey('blocknote')).toBe(false);
    expect(isValidYDocKey('')).toBe(false);
    expect(isValidYDocKey('meta')).toBe(false);
  });

  it('should narrow type when used as type guard', () => {
    const key = 'metadata' as string;

    if (isValidYDocKey(key)) {
      // TypeScript should know key is YDocKey here
      const typed: YDocKey = key;
      expect(typed).toBe('metadata');
    }
  });
});

describe('Type safety', () => {
  it('should prevent typos at compile time', () => {
    // This test ensures the constants prevent typos

    // ✅ This compiles - using the constant
    const validKey: YDocKey = YDOC_KEYS.METADATA;
    expect(validKey).toBe('metadata');

    // ❌ This would NOT compile if uncommented:
    // const invalidKey: YDocKey = 'metdata'; // Typo!

    // The point is that by using YDOC_KEYS.METADATA instead of 'metadata',
    // we get autocomplete and compile-time checking
  });
});
