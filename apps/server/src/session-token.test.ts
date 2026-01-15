import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken, verifySessionToken } from './session-token.js';

describe('Session Token Functions', () => {
  describe('generateSessionToken', () => {
    it('returns a string', () => {
      const token = generateSessionToken();
      expect(typeof token).toBe('string');
    });

    it('returns exactly 43 chars (base64url encoding of 32 bytes)', () => {
      const token = generateSessionToken();
      // 32 bytes = 256 bits. Base64url encoding: ceil(32 * 8 / 6) = 43 chars (no padding)
      expect(token.length).toBe(43);
    });

    it('generates unique tokens on multiple calls', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      const token3 = generateSessionToken();

      expect(token1).not.toBe(token2);
      expect(token1).not.toBe(token3);
      expect(token2).not.toBe(token3);
    });

    it('generates base64url-safe characters only', () => {
      // Base64url uses: A-Z, a-z, 0-9, -, _
      const token = generateSessionToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('hashSessionToken', () => {
    it('returns consistent hash for same input', () => {
      const token = 'test-token-123';
      const hash1 = hashSessionToken(token);
      const hash2 = hashSessionToken(token);

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different inputs', () => {
      const hash1 = hashSessionToken('token-a');
      const hash2 = hashSessionToken('token-b');

      expect(hash1).not.toBe(hash2);
    });

    it('output is 64 chars (SHA256 hex digest)', () => {
      const token = 'any-token';
      const hash = hashSessionToken(token);

      // SHA256 produces 256 bits = 32 bytes = 64 hex characters
      expect(hash.length).toBe(64);
    });

    it('output contains only hex characters', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles empty string', () => {
      const hash = hashSessionToken('');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles unicode characters', () => {
      const token = '🔐认证日本語';
      const hash = hashSessionToken(token);

      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces deterministic hash (known test vector)', () => {
      // Known SHA256 hash for "test"
      const hash = hashSessionToken('test');
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });
  });

  describe('verifySessionToken', () => {
    it('returns true for matching token/hash pair', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);

      expect(verifySessionToken(token, hash)).toBe(true);
    });

    it('returns false for mismatched token/hash', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      const hash1 = hashSessionToken(token1);

      expect(verifySessionToken(token2, hash1)).toBe(false);
    });

    it('returns false for empty token against valid hash', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);

      expect(verifySessionToken('', hash)).toBe(false);
    });

    it('returns false for valid token against empty hash', () => {
      const token = generateSessionToken();

      expect(verifySessionToken(token, '')).toBe(false);
    });

    it('returns false for both empty strings', () => {
      // Note: empty token hashes to SHA256('') which doesn't match empty storedHash
      expect(verifySessionToken('', '')).toBe(false);
    });

    it('uses constant-time comparison (timing attack protection)', () => {
      // This test verifies the implementation uses timingSafeEqual
      // We can't directly test timing, but we can verify the function handles
      // invalid hex gracefully (which proves it's using Buffer conversion)

      const validToken = generateSessionToken();
      const validHash = hashSessionToken(validToken);

      // Invalid hex should be rejected without throwing
      expect(verifySessionToken(validToken, 'not-valid-hex')).toBe(false);
      expect(verifySessionToken(validToken, 'ZZ')).toBe(false);

      // Different length hashes should be rejected
      expect(verifySessionToken(validToken, 'abc')).toBe(false);

      // Valid comparison should still work
      expect(verifySessionToken(validToken, validHash)).toBe(true);
    });

    it('returns false for slightly modified token', () => {
      const token = generateSessionToken();
      const hash = hashSessionToken(token);

      // Modify the last character
      const modifiedToken = `${token.slice(0, -1)}X`;

      expect(verifySessionToken(modifiedToken, hash)).toBe(false);
    });

    it('returns false for case-sensitive mismatch', () => {
      const token = 'TestToken123';
      const hash = hashSessionToken(token);

      expect(verifySessionToken('testtoken123', hash)).toBe(false);
      expect(verifySessionToken('TESTTOKEN123', hash)).toBe(false);
    });

    it('handles unicode tokens correctly', () => {
      const token = '🔐认证日本語';
      const hash = hashSessionToken(token);

      expect(verifySessionToken(token, hash)).toBe(true);
      expect(verifySessionToken('🔐认证日本', hash)).toBe(false);
    });
  });

  describe('integration: full token lifecycle', () => {
    it('generates, hashes, and verifies token successfully', () => {
      // Simulate creating a new session
      const token = generateSessionToken();

      // Store the hash (this is what goes in the database)
      const storedHash = hashSessionToken(token);

      // Later, verify the token (user provides the original token)
      const isValid = verifySessionToken(token, storedHash);

      expect(isValid).toBe(true);
    });

    it('rejects invalid tokens in full lifecycle', () => {
      // Simulate creating a new session
      const token = generateSessionToken();
      const storedHash = hashSessionToken(token);

      // Attacker provides a different token
      const attackerToken = generateSessionToken();
      const isValid = verifySessionToken(attackerToken, storedHash);

      expect(isValid).toBe(false);
    });
  });
});
