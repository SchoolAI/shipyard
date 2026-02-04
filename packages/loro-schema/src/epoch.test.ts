import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EPOCH,
  EPOCH_CLOSE_CODES,
  formatEpochCloseReason,
  isEpochRejection,
  isEpochValid,
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
  });

  describe('DEFAULT_EPOCH', () => {
    it('is a positive integer', () => {
      expect(DEFAULT_EPOCH).toBe(1);
      expect(Number.isInteger(DEFAULT_EPOCH)).toBe(true);
      expect(DEFAULT_EPOCH).toBeGreaterThan(0);
    });
  });
});
