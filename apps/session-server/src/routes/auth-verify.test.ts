import { env } from 'cloudflare:test';
import { ROUTES } from '@shipyard/session';
import { describe, expect, it, vi } from 'vitest';
import { generateSessionToken } from '../auth/jwt';
import type { Env } from '../env';
import { app } from './index';

const mockFindUserById = vi.fn();

vi.mock('../db/index', () => ({
  findOrCreateUser: vi.fn(),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

async function createTestToken(userId = 'usr_test123', displayName = 'Test User'): Promise<string> {
  const testEnv = env as unknown as Env;
  return generateSessionToken(
    { id: userId, displayName },
    ['github'],
    testEnv.JWT_SECRET,
    testEnv.ENVIRONMENT
  );
}

describe(`GET ${ROUTES.AUTH_VERIFY}`, () => {
  it('returns 401 without Authorization header', async () => {
    const res = await app.request(ROUTES.AUTH_VERIFY, { method: 'GET' }, env);

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ valid: false, reason: 'invalid_token' });
  });

  it('returns 401 for invalid JWT', async () => {
    const res = await app.request(
      ROUTES.AUTH_VERIFY,
      {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid.jwt.token' },
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ valid: false, reason: 'invalid_token' });
  });

  it('returns 401 when user not found in database', async () => {
    mockFindUserById.mockResolvedValueOnce(null);

    const token = await createTestToken('usr_deleted');
    const res = await app.request(
      ROUTES.AUTH_VERIFY,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ valid: false, reason: 'user_not_found' });
  });

  it('returns 200 with user info when token is valid', async () => {
    mockFindUserById.mockResolvedValueOnce({
      user: {
        id: 'usr_test123',
        displayName: 'Test User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
        createdAt: Date.now(),
      },
      providers: ['github'],
    });

    const token = await createTestToken();
    const res = await app.request(
      ROUTES.AUTH_VERIFY,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      valid: true,
      user: {
        id: 'usr_test123',
        displayName: 'Test User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
        providers: ['github'],
      },
    });
  });
});
