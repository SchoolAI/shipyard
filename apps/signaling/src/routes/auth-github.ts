import { Hono } from "hono";
import {
	exchangeCodeForToken,
	fetchGitHubUser,
	isMobileUserAgent,
} from "../auth/github";
import { generateSessionToken } from "../auth/jwt";
import type { TokenExchangeResponse } from "../auth/types";
import type { Env } from "../env";
import { AuthGitHubCallbackRequestSchema } from "../schemas";
import { createLogger } from "../utils/logger";
import { errorResponse, parseAndValidateBody } from "../utils/route-helpers";
import { ROUTES } from "./routes";

/**
 * GitHub OAuth callback route.
 *
 * POST /auth/github/callback
 * Body: { code: string, redirect_uri: string }
 * Returns: { token: string, user: { id, username }, is_mobile?: boolean }
 */
export const authGitHubRoute = new Hono<{ Bindings: Env }>();

authGitHubRoute.post(ROUTES.AUTH_GITHUB_CALLBACK, async (c) => {
	const logger = createLogger(c.env);

	const bodyResult = await parseAndValidateBody(
		c,
		AuthGitHubCallbackRequestSchema,
	);
	if (!bodyResult.ok) return bodyResult.error;

	const { code, redirect_uri } = bodyResult.value;

	const tokenResult = await exchangeCodeForToken(
		code,
		redirect_uri,
		c.env.GITHUB_CLIENT_ID,
		c.env.GITHUB_CLIENT_SECRET,
	);

	if ("error" in tokenResult) {
		logger.warn("GitHub token exchange failed", { error: tokenResult.error });
		return errorResponse(c, "token_exchange_failed", tokenResult.error, 401);
	}

	const user = await fetchGitHubUser(tokenResult.accessToken);
	if (!user) {
		logger.warn("Failed to fetch GitHub user");
		return errorResponse(
			c,
			"user_fetch_failed",
			"Could not fetch GitHub user",
			401,
		);
	}

	const shipyardToken = await generateSessionToken(user, c.env.JWT_SECRET);

	const userAgent = c.req.header("User-Agent");
	const isMobile = isMobileUserAgent(userAgent ?? null);

	const response: TokenExchangeResponse = {
		token: shipyardToken,
		user: {
			id: `gh_${user.id}`,
			username: user.login,
		},
		...(isMobile && { is_mobile: true }),
	};

	logger.info("OAuth successful", { username: user.login, isMobile });
	return c.json(response);
});
