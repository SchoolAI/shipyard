import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { decodeToken, generateAgentToken, generateSessionToken, validateToken } from './jwt';

const testEnv = env as unknown as Env;
const TEST_SECRET = testEnv.JWT_SECRET;

const mockUser = {
  id: 'usr_abc123',
  displayName: 'Test User',
};

const mockProviders = ['github'];

describe('jwt', () => {
  describe('generateSessionToken', () => {
    it('generates valid JWT with correct structure', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);

      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      for (const part of parts) {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it('includes correct claims in payload', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(mockUser.id);
      expect(decoded?.displayName).toBe(mockUser.displayName);
      expect(decoded?.providers).toEqual(mockProviders);
      expect(decoded?.iat).toBeDefined();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.scope).toBeUndefined();
      expect(decoded?.machineId).toBeUndefined();
    });

    it('generates token with 30-day expiration', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      const expiresIn = (decoded?.exp ?? 0) - (decoded?.iat ?? 0);
      expect(expiresIn).toBe(30 * 24 * 60 * 60);
    });
  });

  describe('generateAgentToken', () => {
    const taskId = 'task-abc123';
    const machineId = 'machine-xyz789';

    it('generates valid JWT with agent-specific claims', async () => {
      const token = await generateAgentToken(mockUser, mockProviders, taskId, machineId, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(mockUser.id);
      expect(decoded?.displayName).toBe(mockUser.displayName);
      expect(decoded?.providers).toEqual(mockProviders);
      expect(decoded?.scope).toBe(`task:${taskId}`);
      expect(decoded?.machineId).toBe(machineId);
    });

    it('generates token with 24-hour expiration', async () => {
      const token = await generateAgentToken(mockUser, mockProviders, taskId, machineId, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      const expiresIn = (decoded?.exp ?? 0) - (decoded?.iat ?? 0);
      expect(expiresIn).toBe(24 * 60 * 60);
    });
  });

  describe('validateToken', () => {
    it('validates correctly signed token', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);
      const claims = await validateToken(token, TEST_SECRET);

      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe(mockUser.id);
      expect(claims?.displayName).toBe(mockUser.displayName);
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
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);
      const invalidToken = `${token.slice(0, -1)}X`;
      const claims = await validateToken(invalidToken, TEST_SECRET);

      expect(claims).toBeNull();
    });

    it('returns null for token signed with different secret', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, 'wrong-secret');
      const claims = await validateToken(token, TEST_SECRET);

      expect(claims).toBeNull();
    });

    it('returns null for expired token', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);
      const decoded = decodeToken(token);

      const header = { alg: 'HS256', typ: 'JWT' };
      const expiredClaims = {
        ...decoded,
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };

      const headerB64 = base64UrlEncode(JSON.stringify(header));
      const payloadB64 = base64UrlEncode(JSON.stringify(expiredClaims));

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
      const invalidPayload = base64UrlEncode(JSON.stringify({ sub: 'test' }));
      const { hmacSign } = await import('../utils/crypto');
      const signature = await hmacSign(`${header}.${invalidPayload}`, TEST_SECRET);
      const token = `${header}.${invalidPayload}.${signature}`;

      const claims = await validateToken(token, TEST_SECRET);
      expect(claims).toBeNull();
    });

    it('validates agent token with scope and machineId', async () => {
      const token = await generateAgentToken(mockUser, mockProviders, 'task-123', 'machine-456', TEST_SECRET);
      const claims = await validateToken(token, TEST_SECRET);

      expect(claims).not.toBeNull();
      expect(claims?.scope).toBe('task:task-123');
      expect(claims?.machineId).toBe('machine-456');
    });
  });

  describe('decodeToken', () => {
    it('decodes valid token without validation', async () => {
      const token = await generateSessionToken(mockUser, mockProviders, TEST_SECRET);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(mockUser.id);
      expect(decoded?.displayName).toBe(mockUser.displayName);
      expect(decoded?.providers).toEqual(mockProviders);
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
      const header = { alg: 'HS256', typ: 'JWT' };
      const expiredClaims = {
        sub: 'usr_abc123',
        displayName: 'Test User',
        providers: ['github'],
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };

      const headerB64 = base64UrlEncode(JSON.stringify(header));
      const payloadB64 = base64UrlEncode(JSON.stringify(expiredClaims));
      const { hmacSign } = await import('../utils/crypto');
      const signature = await hmacSign(`${headerB64}.${payloadB64}`, TEST_SECRET);
      const token = `${headerB64}.${payloadB64}.${signature}`;

      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe('usr_abc123');
    });
  });
});

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
