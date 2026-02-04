import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { decodeToken, generateAgentToken, generateSessionToken, validateToken } from './jwt';
import type { GitHubUser } from './types';

const testEnv = env as unknown as Env;
const TEST_SECRET = testEnv.JWT_SECRET;

const mockUser: GitHubUser = {
  id: 12345,
  login: 'testuser',
  name: 'Test User',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345',
};

describe('jwt', () => {
  describe('generateSessionToken', () => {
    it('generates valid JWT with correct structure', async () => {
      const token = await generateSessionToken(mockUser, TEST_SECRET);

      // JWT should have 3 parts
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      // Should be base64url encoded
      for (const part of parts) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('includes correct claims in payload', async () => {
      const token = await generateSessionToken(mockUser, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(`gh_${mockUser.id}`);
      expect(decoded?.ghUser).toBe(mockUser.login);
      expect(decoded?.ghId).toBe(mockUser.id);
      expect(decoded?.iat).toBeDefined();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.scope).toBeUndefined();
      expect(decoded?.machineId).toBeUndefined();
    });

    it('generates token with 7-day expiration', async () => {
      const token = await generateSessionToken(mockUser, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      const expiresIn = (decoded?.exp ?? 0) - (decoded?.iat ?? 0);
      // 7 days in seconds
      expect(expiresIn).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('generateAgentToken', () => {
    const taskId = 'task-abc123';
    const machineId = 'machine-xyz789';

    it('generates valid JWT with agent-specific claims', async () => {
      const token = await generateAgentToken(mockUser, taskId, machineId, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(`gh_${mockUser.id}`);
      expect(decoded?.ghUser).toBe(mockUser.login);
      expect(decoded?.ghId).toBe(mockUser.id);
      expect(decoded?.scope).toBe(`task:${taskId}`);
      expect(decoded?.machineId).toBe(machineId);
    });

    it('generates token with 24-hour expiration', async () => {
      const token = await generateAgentToken(mockUser, taskId, machineId, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      const expiresIn = (decoded?.exp ?? 0) - (decoded?.iat ?? 0);
      // 24 hours in seconds
      expect(expiresIn).toBe(24 * 60 * 60);
    });
  });

  describe('validateToken', () => {
    it('validates correctly signed token', async () => {
      const token = await generateSessionToken(mockUser, TEST_SECRET);
      const claims = await validateToken(token, TEST_SECRET);

      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe(`gh_${mockUser.id}`);
      expect(claims?.ghUser).toBe(mockUser.login);
    });

    it('returns null for undefined token', async () => {
      const claims = await validateToken(undefined, TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for empty string token', async () => {
      const claims = await validateToken('', TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for malformed token (not 3 parts)', async () => {
      const claims = await validateToken('only.two', TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with empty parts', async () => {
      const claims = await validateToken('..', TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with missing header', async () => {
      const claims = await validateToken('.payload.signature', TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with missing payload', async () => {
      const claims = await validateToken('header..signature', TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with missing signature', async () => {
      const claims = await validateToken('header.payload.', TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with invalid signature', async () => {
      const token = await generateSessionToken(mockUser, TEST_SECRET);
      // Replace last character of signature to invalidate it
      const invalidToken = `${token.slice(0, -1)}X`;
      const claims = await validateToken(invalidToken, TEST_SECRET);

      expect(claims).toBeNull();
    });

    it('returns null for token signed with different secret', async () => {
      const token = await generateSessionToken(mockUser, 'wrong-secret');
      const claims = await validateToken(token, TEST_SECRET);

      expect(claims).toBeNull();
    });

    it('returns null for expired token', async () => {
      // Create token that expired 1 hour ago
      const token = await generateSessionToken(mockUser, TEST_SECRET);
      const decoded = decodeToken(token);

      // Manually create expired token by modifying the payload
      const header = { alg: 'HS256', typ: 'JWT' };
      const expiredClaims = {
        ...decoded,
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const headerB64 = base64UrlEncode(JSON.stringify(header));
      const payloadB64 = base64UrlEncode(JSON.stringify(expiredClaims));

      // Use the real signing logic by importing crypto utilities
      const { hmacSign } = await import('../utils/crypto');
      const signature = await hmacSign(`${headerB64}.${payloadB64}`, TEST_SECRET);
      const expiredToken = `${headerB64}.${payloadB64}.${signature}`;

      const claims = await validateToken(expiredToken, TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with invalid JSON payload', async () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64UrlEncode('not-json');
      const { hmacSign } = await import('../utils/crypto');
      const signature = await hmacSign(`${header}.${payload}`, TEST_SECRET);
      const token = `${header}.${payload}.${signature}`;

      const claims = await validateToken(token, TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('returns null for token with missing required fields', async () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const invalidPayload = base64UrlEncode(JSON.stringify({ sub: 'test' })); // Missing required fields
      const { hmacSign } = await import('../utils/crypto');
      const signature = await hmacSign(`${header}.${invalidPayload}`, TEST_SECRET);
      const token = `${header}.${invalidPayload}.${signature}`;

      const claims = await validateToken(token, TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('validates agent token with scope and machineId', async () => {
      const token = await generateAgentToken(mockUser, 'task-123', 'machine-456', TEST_SECRET);
      const claims = await validateToken(token, TEST_SECRET);

      expect(claims).not.toBeNull();
      expect(claims?.scope).toBe('task:task-123');
      expect(claims?.machineId).toBe('machine-456');
    });
  });

  describe('decodeToken', () => {
    it('decodes valid token without validation', async () => {
      const token = await generateSessionToken(mockUser, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(`gh_${mockUser.id}`);
      expect(decoded?.ghUser).toBe(mockUser.login);
      expect(decoded?.ghId).toBe(mockUser.id);
    });

    it('returns null for malformed token (not 3 parts)', () => {
      const decoded = decodeToken('only.two');
      expect(decoded).toBeNull();
    });

    it('returns null for token with empty payload', () => {
      const decoded = decodeToken('header..signature');
      expect(decoded).toBeNull();
    });

    it('returns null for token with invalid JSON', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256' }));
      const payload = base64UrlEncode('not-json');
      const token = `${header}.${payload}.signature`;

      const decoded = decodeToken(token);
      expect(decoded).toBeNull();
    });

    it('returns null for token with invalid schema', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256' }));
      const payload = base64UrlEncode(JSON.stringify({ invalid: 'schema' }));
      const token = `${header}.${payload}.signature`;

      const decoded = decodeToken(token);
      expect(decoded).toBeNull();
    });

    it('decodes expired token (no validation)', async () => {
      // Create token with expired timestamp
      const header = { alg: 'HS256', typ: 'JWT' };
      const expiredClaims = {
        sub: 'gh_12345',
        ghUser: 'testuser',
        ghId: 12345,
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };

      const headerB64 = base64UrlEncode(JSON.stringify(header));
      const payloadB64 = base64UrlEncode(JSON.stringify(expiredClaims));
      const { hmacSign } = await import('../utils/crypto');
      const signature = await hmacSign(`${headerB64}.${payloadB64}`, TEST_SECRET);
      const token = `${headerB64}.${payloadB64}.${signature}`;

      // decodeToken should return the payload even if expired
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe('gh_12345');
    });
  });
});

// Helper function for base64url encoding (matching implementation)
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
