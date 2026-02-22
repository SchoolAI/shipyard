import { describe, expect, it } from 'vitest';
import {
  buildDocumentId,
  buildTaskConvDocId,
  buildTaskMetaDocId,
  buildTaskReviewDocId,
  DEFAULT_EPOCH,
  EPOCH_CLOSE_CODES,
  formatEpochCloseReason,
  isEpochRejection,
  isEpochValid,
  parseDocumentId,
  parseEpochFromReason,
  parseEpochParam,
} from './epoch.js';

describe('epoch utilities', () => {
  describe('formatEpochCloseReason', () => {
    it('formats epoch in reason string', () => {
      expect(formatEpochCloseReason(5)).toBe('epoch_too_old:5');
      expect(formatEpochCloseReason(1)).toBe('epoch_too_old:1');
      expect(formatEpochCloseReason(100)).toBe('epoch_too_old:100');
    });
  });

  describe('parseEpochFromReason', () => {
    it('parses valid epoch from reason', () => {
      expect(parseEpochFromReason('epoch_too_old:5')).toBe(5);
      expect(parseEpochFromReason('epoch_too_old:1')).toBe(1);
      expect(parseEpochFromReason('epoch_too_old:100')).toBe(100);
    });

    it('returns null for invalid reasons', () => {
      expect(parseEpochFromReason('epoch_too_old')).toBe(null);
      expect(parseEpochFromReason('epoch_too_old:')).toBe(null);
      expect(parseEpochFromReason('epoch_too_old:abc')).toBe(null);
      expect(parseEpochFromReason('epoch_too_old:0')).toBe(null);
      expect(parseEpochFromReason('epoch_too_old:-1')).toBe(null);
      expect(parseEpochFromReason('other_reason')).toBe(null);
      expect(parseEpochFromReason('')).toBe(null);
    });

    it('rejects partial numeric strings', () => {
      expect(parseEpochFromReason('epoch_too_old:3abc')).toBe(null);
      expect(parseEpochFromReason('epoch_too_old:3.5')).toBe(null);
    });

    it('roundtrips with formatEpochCloseReason', () => {
      for (const epoch of [1, 5, 10, 100, 999]) {
        const reason = formatEpochCloseReason(epoch);
        expect(parseEpochFromReason(reason)).toBe(epoch);
      }
    });
  });

  describe('isEpochRejection', () => {
    it('detects rejection by close code', () => {
      expect(isEpochRejection(EPOCH_CLOSE_CODES.EPOCH_TOO_OLD)).toBe(true);
      expect(isEpochRejection(EPOCH_CLOSE_CODES.EPOCH_TOO_OLD, 'epoch_too_old:5')).toBe(true);
    });

    it('detects rejection by reason string', () => {
      expect(isEpochRejection(1000, 'epoch_too_old:5')).toBe(true);
      expect(isEpochRejection(1000, 'epoch_too_old')).toBe(true);
    });

    it('returns false for non-rejection', () => {
      expect(isEpochRejection(1000)).toBe(false);
      expect(isEpochRejection(1000, 'other_reason')).toBe(false);
      expect(isEpochRejection(1000, undefined)).toBe(false);
    });
  });

  describe('isEpochValid', () => {
    it('validates client epoch against minimum', () => {
      expect(isEpochValid(5, 5)).toBe(true);
      expect(isEpochValid(6, 5)).toBe(true);
      expect(isEpochValid(4, 5)).toBe(false);
      expect(isEpochValid(1, 1)).toBe(true);
    });
  });

  describe('parseEpochParam', () => {
    it('parses epoch from URLSearchParams', () => {
      expect(parseEpochParam(new URLSearchParams('epoch=5'))).toBe(5);
      expect(parseEpochParam(new URLSearchParams('epoch=1'))).toBe(1);
    });

    it('returns null for missing or invalid epoch', () => {
      expect(parseEpochParam(new URLSearchParams(''))).toBe(null);
      expect(parseEpochParam(new URLSearchParams('epoch='))).toBe(null);
      expect(parseEpochParam(new URLSearchParams('epoch=abc'))).toBe(null);
      expect(parseEpochParam(new URLSearchParams('epoch=0'))).toBe(null);
      expect(parseEpochParam(new URLSearchParams('epoch=-1'))).toBe(null);
    });

    it('rejects partial numeric strings', () => {
      expect(parseEpochParam(new URLSearchParams('epoch=3abc'))).toBe(null);
      expect(parseEpochParam(new URLSearchParams('epoch=3.5'))).toBe(null);
    });
  });

  describe('DEFAULT_EPOCH', () => {
    it('is a positive integer', () => {
      expect(DEFAULT_EPOCH).toBe(2);
      expect(Number.isInteger(DEFAULT_EPOCH)).toBe(true);
      expect(DEFAULT_EPOCH).toBeGreaterThan(0);
    });
  });

  describe('buildDocumentId', () => {
    it('builds epoch-versioned document ID', () => {
      expect(buildDocumentId('task', 'abc123', 1)).toBe('task:abc123:1');
      expect(buildDocumentId('task', 'xyz', 5)).toBe('task:xyz:5');
      expect(buildDocumentId('session', 'sess-1', 2)).toBe('session:sess-1:2');
    });

    it('throws if prefix contains colon', () => {
      expect(() => buildDocumentId('pre:fix', 'key', 1)).toThrow('must not contain colons');
    });

    it('throws if key contains colon', () => {
      expect(() => buildDocumentId('prefix', 'key:val', 1)).toThrow('must not contain colons');
    });

    it('throws if both prefix and key contain colons', () => {
      expect(() => buildDocumentId('a:b', 'c:d', 1)).toThrow('must not contain colons');
    });
  });

  describe('parseDocumentId', () => {
    it('parses valid document IDs', () => {
      expect(parseDocumentId('task:abc123:1')).toEqual({ prefix: 'task', key: 'abc123', epoch: 1 });
      expect(parseDocumentId('session:sess-1:5')).toEqual({
        prefix: 'session',
        key: 'sess-1',
        epoch: 5,
      });
    });

    it('returns null for invalid IDs', () => {
      expect(parseDocumentId('task:abc')).toBe(null);
      expect(parseDocumentId('task')).toBe(null);
      expect(parseDocumentId('')).toBe(null);
      expect(parseDocumentId('task:abc:0')).toBe(null);
      expect(parseDocumentId('task:abc:-1')).toBe(null);
      expect(parseDocumentId('task:abc:notanumber')).toBe(null);
      expect(parseDocumentId('a:b:c:d')).toBe(null);
    });

    it('rejects non-integer epoch strings', () => {
      expect(parseDocumentId('task:abc:3abc')).toBe(null);
      expect(parseDocumentId('task:abc:3.5')).toBe(null);
    });

    it('roundtrips with buildDocumentId', () => {
      const id = buildDocumentId('task', 'test-123', 3);
      const parsed = parseDocumentId(id);
      expect(parsed).toEqual({ prefix: 'task', key: 'test-123', epoch: 3 });
    });
  });

  describe('task doc ID builders', () => {
    it('builds correct task-meta doc ID', () => {
      expect(buildTaskMetaDocId('abc123', 1)).toBe('task-meta:abc123:1');
    });

    it('builds correct task-conv doc ID', () => {
      expect(buildTaskConvDocId('abc123', 1)).toBe('task-conv:abc123:1');
    });

    it('builds correct task-review doc ID', () => {
      expect(buildTaskReviewDocId('abc123', 1)).toBe('task-review:abc123:1');
    });

    it('round-trips through parseDocumentId', () => {
      const metaId = buildTaskMetaDocId('test-42', 3);
      expect(parseDocumentId(metaId)).toEqual({ prefix: 'task-meta', key: 'test-42', epoch: 3 });

      const convId = buildTaskConvDocId('test-42', 3);
      expect(parseDocumentId(convId)).toEqual({ prefix: 'task-conv', key: 'test-42', epoch: 3 });

      const reviewId = buildTaskReviewDocId('test-42', 3);
      expect(parseDocumentId(reviewId)).toEqual({
        prefix: 'task-review',
        key: 'test-42',
        epoch: 3,
      });
    });

    it('uses different prefixes for the same task', () => {
      const metaId = buildTaskMetaDocId('abc123', 1);
      const convId = buildTaskConvDocId('abc123', 1);
      const reviewId = buildTaskReviewDocId('abc123', 1);

      expect(metaId).not.toBe(convId);
      expect(metaId).not.toBe(reviewId);
      expect(convId).not.toBe(reviewId);
    });
  });
});
