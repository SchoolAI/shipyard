import { env } from 'cloudflare:test';
import { ROUTES } from '@shipyard/session';
import { describe, expect, it } from 'vitest';
import { generateSessionToken } from '../auth/jwt';
import type { Env } from '../env';
import { app } from './index';

/**
 * Helper to create a valid JWT for testing
 */
async function createTestToken(userId = 12345, username = 'testuser'): Promise<string> {
  return generateSessionToken({ id: userId, login: username }, (env as unknown as Env).JWT_SECRET);
}

/**
 * Helper to create an expired JWT for testing
 */
function createExpiredToken(): string {
  // Create a malformed token that looks valid but has an expired exp
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const payload = btoa(
    JSON.stringify({
      sub: 'gh_12345',
      ghUser: 'testuser',
      ghId: 12345,
      iat: Math.floor(Date.now() / 1000) - 86400,
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    })
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // Invalid signature - will fail validation
  return `${header}.${payload}.invalid_signature`;
}

describe(`POST ${ROUTES.COLLAB_CREATE}`, () => {
  it('returns 401 without Authorization header', async () => {
    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-123' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('unauthorized');
    expect(json.message).toBe('Bearer token required');
  });

  it('returns 401 for invalid Authorization format', async () => {
    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic dXNlcjpwYXNz',
        },
        body: JSON.stringify({ taskId: 'task-123' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('unauthorized');
  });

  it('returns 401 for invalid JWT', async () => {
    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.jwt.token',
        },
        body: JSON.stringify({ taskId: 'task-123' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('invalid_token');
    expect(json.message).toBe('Invalid or expired token');
  });

  it('returns 401 for expired JWT', async () => {
    const expiredToken = createExpiredToken();

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expiredToken}`,
        },
        body: JSON.stringify({ taskId: 'task-123' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('invalid_token');
  });

  it('returns 400 for invalid JSON body', async () => {
    const token = await createTestToken();

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: 'not valid json',
      },
      env
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('invalid_body');
  });

  it('returns 400 for missing taskId', async () => {
    const token = await createTestToken();

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      },
      env
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('validation_error');
    expect(json.details).toBeDefined();
  });

  it('returns 400 for empty taskId', async () => {
    const token = await createTestToken();

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: '' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toBe('validation_error');
  });

  it('returns pre-signed URL for valid request', async () => {
    const token = await createTestToken();

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: 'task-123' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    // Verify response structure
    expect(json.url).toBeDefined();
    expect(typeof json.url).toBe('string');
    expect(json.url).toContain('/collab/');
    expect(json.url).toContain('token=');

    expect(json.roomId).toBeDefined();
    expect(typeof json.roomId).toBe('string');
    expect((json.roomId as string).length).toBe(16); // generateId(16)

    expect(json.expiresAt).toBeDefined();
    expect(typeof json.expiresAt).toBe('number');
    expect(json.expiresAt).toBeGreaterThan(Date.now());
  });

  it('respects custom expiresInMinutes', async () => {
    const token = await createTestToken();
    const expiresInMinutes = 30;

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: 'task-123', expiresInMinutes }),
      },
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    // Verify expiration is approximately 30 minutes from now
    const expectedExpiry = Date.now() + expiresInMinutes * 60 * 1000;
    // Allow 5 second tolerance for test execution time
    expect(json.expiresAt).toBeGreaterThan(expectedExpiry - 5000);
    expect(json.expiresAt).toBeLessThan(expectedExpiry + 5000);
  });

  it('returns 400 for expiresInMinutes out of range', async () => {
    const token = await createTestToken();

    // Test minimum bound
    const res1 = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: 'task-123', expiresInMinutes: 0 }),
      },
      env
    );

    expect(res1.status).toBe(400);
    const json1 = (await res1.json()) as Record<string, unknown>;
    expect(json1.error).toBe('validation_error');

    // Test maximum bound (> 24 hours)
    const res2 = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: 'task-123', expiresInMinutes: 1500 }),
      },
      env
    );

    expect(res2.status).toBe(400);
    const json2 = (await res2.json()) as Record<string, unknown>;
    expect(json2.error).toBe('validation_error');
  });

  it('uses default expiresInMinutes when not provided', async () => {
    const token = await createTestToken();

    const res = await app.request(
      ROUTES.COLLAB_CREATE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId: 'task-123' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    // Default is 60 minutes
    const expectedExpiry = Date.now() + 60 * 60 * 1000;
    expect(json.expiresAt).toBeGreaterThan(expectedExpiry - 5000);
    expect(json.expiresAt).toBeLessThan(expectedExpiry + 5000);
  });
});
