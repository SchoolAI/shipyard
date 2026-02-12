import { describe, expect, it } from 'vitest';
import {
  generateSessionId,
  generateTaskId,
  toSessionId,
  toTaskId,
} from './ids.js';

describe('id utilities', () => {
  describe('generateTaskId', () => {
    it('generates a non-empty string', () => {
      const id = generateTaskId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('generates unique IDs', () => {
      const a = generateTaskId();
      const b = generateTaskId();
      expect(a).not.toBe(b);
    });
  });

  describe('generateSessionId', () => {
    it('generates a non-empty string', () => {
      const id = generateSessionId();
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('generates unique IDs', () => {
      const a = generateSessionId();
      const b = generateSessionId();
      expect(a).not.toBe(b);
    });
  });

  describe('toTaskId', () => {
    it('accepts a valid non-empty string', () => {
      const id = toTaskId('abc123');
      expect(id).toBe('abc123');
    });

    it('throws on empty string', () => {
      expect(() => toTaskId('')).toThrow('Invalid TaskId');
    });

    it('throws on string exceeding 128 characters', () => {
      const long = 'x'.repeat(129);
      expect(() => toTaskId(long)).toThrow('Invalid TaskId');
    });

    it('accepts string of exactly 128 characters', () => {
      const exact = 'x'.repeat(128);
      expect(toTaskId(exact)).toBe(exact);
    });
  });

  describe('toSessionId', () => {
    it('accepts a valid non-empty string', () => {
      const id = toSessionId('sess-abc');
      expect(id).toBe('sess-abc');
    });

    it('throws on empty string', () => {
      expect(() => toSessionId('')).toThrow('Invalid SessionId');
    });

    it('throws on string exceeding 128 characters', () => {
      const long = 'y'.repeat(129);
      expect(() => toSessionId(long)).toThrow('Invalid SessionId');
    });

    it('accepts string of exactly 128 characters', () => {
      const exact = 'y'.repeat(128);
      expect(toSessionId(exact)).toBe(exact);
    });
  });
});
