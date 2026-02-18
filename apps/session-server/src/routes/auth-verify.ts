import { ROUTES } from '@shipyard/session';
import { Hono } from 'hono';
import { validateToken } from '../auth/jwt';
import { findUserById } from '../db/index';
import type { Env } from '../env';
import { extractBearerToken } from '../utils/route-helpers';

export const authVerifyRoute = new Hono<{ Bindings: Env }>();

authVerifyRoute.get(ROUTES.AUTH_VERIFY, async (c) => {
  const tokenResult = extractBearerToken(c);
  if (!tokenResult.ok) {
    return c.json({ valid: false, reason: 'invalid_token' }, 401);
  }

  const claims = await validateToken(tokenResult.value, c.env.JWT_SECRET, c.env.ENVIRONMENT);
  if (!claims) {
    return c.json({ valid: false, reason: 'invalid_token' }, 401);
  }

  const result = await findUserById(claims.sub, c.env.DB);
  if (!result) {
    return c.json({ valid: false, reason: 'user_not_found' }, 401);
  }

  return c.json({
    valid: true,
    user: {
      id: result.user.id,
      displayName: result.user.displayName,
      avatarUrl: result.user.avatarUrl,
      providers: result.providers,
    },
  });
});
