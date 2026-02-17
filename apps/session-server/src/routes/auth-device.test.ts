import { env, fetchMock } from 'cloudflare:test';
import { ROUTES } from '@shipyard/session';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from './index';

vi.mock('../db/index', () => ({
  findOrCreateUser: vi.fn().mockResolvedValue({
    user: {
      id: 'usr_device123',
      displayName: 'Device User',
      avatarUrl: 'https://avatars.githubusercontent.com/u/99999',
      createdAt: Date.now(),
    },
    providers: ['github'],
  }),
  findUserById: vi.fn().mockResolvedValue({
    user: {
      id: 'usr_device123',
      displayName: 'Device User',
      avatarUrl: 'https://avatars.githubusercontent.com/u/99999',
      createdAt: Date.now(),
    },
    providers: ['github'],
  }),
}));

vi.mock('../db/device-flow', () => {
  const sessions = new Map<
    string,
    { deviceCode: string; userCode: string; expiresAt: number; authorizedUserId: string | null }
  >();

  return {
    cleanupExpiredDevices: vi.fn().mockResolvedValue(0),
    createDeviceSession: vi.fn().mockImplementation(async () => {
      const deviceCode = 'dc_test_device_code';
      const userCode = 'ABCD-1234';
      const expiresAt = Date.now() + 15 * 60 * 1000;
      sessions.set(deviceCode, { deviceCode, userCode, expiresAt, authorizedUserId: null });
      return { deviceCode, userCode, expiresAt };
    }),
    findDeviceByUserCode: vi.fn().mockImplementation(async (userCode: string) => {
      for (const s of sessions.values()) {
        if (s.userCode === userCode && s.expiresAt > Date.now()) {
          return { deviceCode: s.deviceCode, expiresAt: s.expiresAt };
        }
      }
      return null;
    }),
    authorizeDevice: vi.fn().mockImplementation(async (userCode: string, userId: string) => {
      for (const s of sessions.values()) {
        if (s.userCode === userCode && !s.authorizedUserId) {
          s.authorizedUserId = userId;
          return true;
        }
      }
      return false;
    }),
    pollDeviceAuthorization: vi.fn().mockImplementation(async (deviceCode: string) => {
      const s = sessions.get(deviceCode);
      if (!s) return { status: 'not_found' };
      if (s.expiresAt < Date.now()) return { status: 'expired' };
      if (s.authorizedUserId) return { status: 'authorized', userId: s.authorizedUserId };
      return { status: 'pending' };
    }),
  };
});

const GITHUB_TOKEN_URL = 'https://github.com';
const GITHUB_API_URL = 'https://api.github.com';

describe('Device Flow', () => {
  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => {
    fetchMock.assertNoPendingInterceptors();
  });

  describe(`POST ${ROUTES.AUTH_DEVICE_START}`, () => {
    it('returns deviceCode, userCode, verificationUri', async () => {
      const res = await app.request(ROUTES.AUTH_DEVICE_START, { method: 'POST' }, env);

      expect(res.status).toBe(200);
      const json = await res.json<Record<string, unknown>>();
      expect(json.deviceCode).toBe('dc_test_device_code');
      expect(json.userCode).toBe('ABCD-1234');
      expect(json.verificationUri).toContain(ROUTES.AUTH_DEVICE_VERIFY);
      expect(json.verificationUri).toContain('code=ABCD-1234');
      expect(json.expiresIn).toBeGreaterThan(0);
      expect(json.interval).toBe(5);
    });
  });

  describe(`GET ${ROUTES.AUTH_DEVICE_VERIFY}`, () => {
    it('returns HTML page for valid user code', async () => {
      const res = await app.request(
        `${ROUTES.AUTH_DEVICE_VERIFY}?code=ABCD-1234`,
        { method: 'GET' },
        env
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('ABCD-1234');
      expect(html).toContain('Sign in with GitHub');
      expect(html).toContain('github.com/login/oauth/authorize');
    });

    it('returns 400 for missing code', async () => {
      const res = await app.request(ROUTES.AUTH_DEVICE_VERIFY, { method: 'GET' }, env);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid user code', async () => {
      const { findDeviceByUserCode } = await import('../db/device-flow');
      vi.mocked(findDeviceByUserCode).mockResolvedValueOnce(null);

      const res = await app.request(
        `${ROUTES.AUTH_DEVICE_VERIFY}?code=XXXX-9999`,
        { method: 'GET' },
        env
      );
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('Invalid or expired code');
    });

    it('completes authorization on GitHub OAuth callback', async () => {
      fetchMock
        .get(GITHUB_TOKEN_URL)
        .intercept({ path: '/login/oauth/access_token', method: 'POST' })
        .reply(200, JSON.stringify({ access_token: 'gho_device_token' }), {
          headers: { 'Content-Type': 'application/json' },
        });

      fetchMock
        .get(GITHUB_API_URL)
        .intercept({ path: '/user', method: 'GET' })
        .reply(
          200,
          JSON.stringify({
            id: 99999,
            login: 'deviceuser',
            name: 'Device User',
            avatar_url: 'https://avatars.githubusercontent.com/u/99999',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );

      const res = await app.request(
        `${ROUTES.AUTH_DEVICE_VERIFY}?code=gh_auth_code_123&state=ABCD-1234`,
        { method: 'GET' },
        env
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Authorized');
      expect(html).toContain('Device User');
    });
  });

  describe(`POST ${ROUTES.AUTH_DEVICE_POLL}`, () => {
    it('returns authorization_pending for pending device', async () => {
      const { pollDeviceAuthorization } = await import('../db/device-flow');
      vi.mocked(pollDeviceAuthorization).mockResolvedValueOnce({ status: 'pending' });

      const res = await app.request(
        ROUTES.AUTH_DEVICE_POLL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: 'dc_test_device_code' }),
        },
        env
      );

      expect(res.status).toBe(400);
      const json = await res.json<Record<string, unknown>>();
      expect(json.error).toBe('authorization_pending');
    });

    it('returns token and user for authorized device', async () => {
      const { pollDeviceAuthorization } = await import('../db/device-flow');
      vi.mocked(pollDeviceAuthorization).mockResolvedValueOnce({
        status: 'authorized',
        userId: 'usr_device123',
      });

      const res = await app.request(
        ROUTES.AUTH_DEVICE_POLL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: 'dc_test_device_code' }),
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json<Record<string, unknown>>();
      expect(json.token).toBeDefined();
      expect(typeof json.token).toBe('string');
      expect(String(json.token).split('.')).toHaveLength(3);
      expect(json.user).toEqual({
        id: 'usr_device123',
        displayName: 'Device User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/99999',
        providers: ['github'],
      });
    });

    it('returns expired_token for expired device', async () => {
      const { pollDeviceAuthorization } = await import('../db/device-flow');
      vi.mocked(pollDeviceAuthorization).mockResolvedValueOnce({ status: 'expired' });

      const res = await app.request(
        ROUTES.AUTH_DEVICE_POLL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: 'dc_expired' }),
        },
        env
      );

      expect(res.status).toBe(400);
      const json = await res.json<Record<string, unknown>>();
      expect(json.error).toBe('expired_token');
    });

    it('returns expired_token for unknown device', async () => {
      const { pollDeviceAuthorization } = await import('../db/device-flow');
      vi.mocked(pollDeviceAuthorization).mockResolvedValueOnce({ status: 'not_found' });

      const res = await app.request(
        ROUTES.AUTH_DEVICE_POLL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode: 'dc_unknown' }),
        },
        env
      );

      expect(res.status).toBe(400);
      const json = await res.json<Record<string, unknown>>();
      expect(json.error).toBe('expired_token');
    });

    it('returns 400 for missing deviceCode', async () => {
      const res = await app.request(
        ROUTES.AUTH_DEVICE_POLL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env
      );

      expect(res.status).toBe(400);
      const json = await res.json<Record<string, unknown>>();
      expect(json.error).toBe('validation_error');
    });
  });
});
