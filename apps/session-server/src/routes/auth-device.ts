import { DevicePollRequestSchema, ROUTES } from '@shipyard/session';
import { Hono } from 'hono';
import { exchangeCodeForToken, fetchGitHubUser } from '../auth/github';
import { generateSessionToken } from '../auth/jwt';
import {
  authorizeDevice,
  cleanupExpiredDevices,
  createDeviceSession,
  findDeviceByUserCode,
  pollDeviceAuthorization,
} from '../db/device-flow';
import { findOrCreateUser, findUserById } from '../db/index';
import type { Env } from '../env';
import { createLogger } from '../utils/logger';
import { errorResponse, parseAndValidateBody } from '../utils/route-helpers';

function getBaseUrl(env: Env): string {
  return env.ENVIRONMENT === 'production'
    ? 'https://shipyard-session-server.jacob-191.workers.dev'
    : 'http://localhost:4444';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const authDeviceRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /auth/device/start
 *
 * CLI calls this to begin the device flow. Returns a device code for polling
 * and a user code + URL for the human to visit in their browser.
 */
authDeviceRoute.post(ROUTES.AUTH_DEVICE_START, async (c) => {
  const logger = createLogger(c.env);

  await cleanupExpiredDevices(c.env.DB).catch(() => {});

  const session = await createDeviceSession(c.env.DB);

  const verificationUri = `${getBaseUrl(c.env)}${ROUTES.AUTH_DEVICE_VERIFY}?code=${session.userCode}`;

  logger.info('Device flow started', { userCode: session.userCode });

  return c.json({
    deviceCode: session.deviceCode,
    userCode: session.userCode,
    verificationUri,
    expiresIn: Math.floor((session.expiresAt - Date.now()) / 1000),
    interval: 5,
  });
});

/**
 * GET /auth/device/verify
 *
 * User visits this URL in their browser. Two modes:
 * 1. Initial visit (?code=USER_CODE, no state param) -- show confirmation page with GitHub OAuth link
 * 2. GitHub OAuth callback (?code=GITHUB_CODE&state=USER_CODE) -- complete authorization
 *
 * GitHub redirects back with ?code=GITHUB_AUTH_CODE&state=USER_CODE.
 * We distinguish the two cases by checking for the `state` query param.
 */
authDeviceRoute.get(ROUTES.AUTH_DEVICE_VERIFY, async (c) => {
  const logger = createLogger(c.env);

  const state = c.req.query('state');
  const code = c.req.query('code');

  if (!code) {
    return c.html(
      '<!DOCTYPE html><html><body><h1>Missing code</h1><p>Please run <code>shipyard login</code> to get a valid link.</p></body></html>',
      400
    );
  }

  if (!state) {
    /** Initial visit: code param is the user code */
    const userCode = code;
    const device = await findDeviceByUserCode(userCode, c.env.DB);
    if (!device) {
      return c.html(
        '<!DOCTYPE html><html><body><h1>Invalid or expired code</h1><p>Please run <code>shipyard login</code> again.</p></body></html>',
        400
      );
    }

    const redirectUri = `${getBaseUrl(c.env)}${ROUTES.AUTH_DEVICE_VERIFY}`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${c.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(userCode)}&scope=read:user`;

    return c.html(`<!DOCTYPE html>
<html>
<head><title>Shipyard Device Login</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; }
  code { background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-size: 1.2em; }
  a.btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #24292e; color: white; text-decoration: none; border-radius: 6px; font-size: 1em; }
  a.btn:hover { background: #444d56; }
</style>
</head>
<body>
  <h1>Shipyard Device Login</h1>
  <p>Confirm this code matches your terminal:</p>
  <p><code>${escapeHtml(userCode)}</code></p>
  <a class="btn" href="${escapeHtml(githubAuthUrl)}">Sign in with GitHub</a>
</body>
</html>`);
  }

  /** GitHub OAuth callback: code is GitHub auth code, state is user code */
  const ghCode = code;
  const userCode = state;

  const redirectUri = `${getBaseUrl(c.env)}${ROUTES.AUTH_DEVICE_VERIFY}`;
  const tokenResult = await exchangeCodeForToken(
    ghCode,
    redirectUri,
    c.env.GITHUB_CLIENT_ID,
    c.env.GITHUB_CLIENT_SECRET
  );

  if ('error' in tokenResult) {
    logger.warn('Device flow: GitHub token exchange failed', { error: tokenResult.error });
    return c.html(
      '<!DOCTYPE html><html><body><h1>Authentication failed</h1><p>Please try again.</p></body></html>',
      401
    );
  }

  const ghUser = await fetchGitHubUser(tokenResult.accessToken);
  if (!ghUser) {
    return c.html(
      '<!DOCTYPE html><html><body><h1>Failed to fetch user</h1><p>Please try again.</p></body></html>',
      401
    );
  }

  const { user: shipyardUser } = await findOrCreateUser('github', ghUser, c.env.DB);
  const authorized = await authorizeDevice(userCode, shipyardUser.id, c.env.DB);

  if (!authorized) {
    return c.html(
      '<!DOCTYPE html><html><body><h1>Code expired or already used</h1><p>Please run <code>shipyard login</code> again.</p></body></html>',
      400
    );
  }

  logger.info('Device authorized', {
    userId: shipyardUser.id,
    displayName: shipyardUser.displayName,
  });

  return c.html(`<!DOCTYPE html>
<html>
<head><title>Shipyard - Authorized</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; }
</style>
</head>
<body>
  <h1>Authorized</h1>
  <p>Logged in as <strong>${escapeHtml(shipyardUser.displayName)}</strong></p>
  <p>You can close this tab and return to your terminal.</p>
</body>
</html>`);
});

/**
 * POST /auth/device/poll
 *
 * CLI polls this endpoint with the device code until the user authorizes
 * or the code expires.
 */
authDeviceRoute.post(ROUTES.AUTH_DEVICE_POLL, async (c) => {
  const logger = createLogger(c.env);

  const bodyResult = await parseAndValidateBody(c, DevicePollRequestSchema);
  if (!bodyResult.ok) return bodyResult.error;

  const { deviceCode } = bodyResult.value;
  const result = await pollDeviceAuthorization(deviceCode, c.env.DB);

  switch (result.status) {
    case 'authorized': {
      const userData = await findUserById(result.userId, c.env.DB);
      if (!userData) {
        return errorResponse(c, 'user_not_found', 'Authorized user not found', 500);
      }

      const token = await generateSessionToken(
        userData.user,
        userData.providers,
        c.env.JWT_SECRET,
        c.env.ENVIRONMENT
      );

      logger.info('Device flow completed', { userId: userData.user.id });

      return c.json({
        token,
        user: {
          id: userData.user.id,
          displayName: userData.user.displayName,
          avatarUrl: userData.user.avatarUrl,
          providers: userData.providers,
        },
      });
    }
    case 'pending':
      return c.json({ error: 'authorization_pending' }, 400);
    case 'expired':
      return c.json({ error: 'expired_token' }, 400);
    case 'not_found':
      return c.json({ error: 'expired_token' }, 400);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
});
