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
      EVENTS: 'events',
      SNAPSHOTS: 'snapshots',
      INPUT_REQUESTS: 'inputRequests',
      LOCAL_DIFF_COMMENTS: 'localDiffComments',
      CHANGE_SNAPSHOTS: 'changeSnapshots',
    });
  });

  it('should have unique values', () => {
    const values = Object.values(YDOC_KEYS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('should be type-safe', () => {
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
    expect(isValidYDocKey('snapshots')).toBe(true);
    expect(isValidYDocKey('localDiffComments')).toBe(true);
    expect(isValidYDocKey('changeSnapshots')).toBe(true);
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
      const typed: YDocKey = key;
      expect(typed).toBe('metadata');
    }
  });
});

describe('Type safety', () => {
  it('should prevent typos at compile time', () => {
    const validKey: YDocKey = YDOC_KEYS.METADATA;
    expect(validKey).toBe('metadata');
  });
});
