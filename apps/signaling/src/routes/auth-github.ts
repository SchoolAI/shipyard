import { Hono } from "hono";
import {
	exchangeCodeForToken,
	fetchGitHubUser,
	isMobileUserAgent,
} from "../auth/github";
import { generateSessionToken } from "../auth/jwt";
import type {
	TokenExchangeRequest,
	TokenExchangeResponse,
} from "../auth/types";
import type { Env } from "../env";
import { createLogger } from "../utils/logger";

/**
 * GitHub OAuth callback route.
 *
 * POST /auth/github/callback
 * Body: { code: string, redirect_uri: string }
 * Returns: { token: string, user: { id, username }, is_mobile?: boolean }
 */
export const authGitHubRoute = new Hono<{ Bindings: Env }>();

authGitHubRoute.post("/auth/github/callback", async (c) => {
	const logger = createLogger(c.env);

	// Parse request body
	let body: TokenExchangeRequest;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid_body", message: "Invalid JSON body" }, 400);
	}

	// Validate required fields
	if (!body.code || typeof body.code !== "string") {
		return c.json({ error: "missing_code", message: "code is required" }, 400);
	}
	if (!body.redirect_uri || typeof body.redirect_uri !== "string") {
		return c.json(
			{ error: "missing_redirect_uri", message: "redirect_uri is required" },
			400,
		);
	}

	// Exchange code for GitHub token
	const tokenResult = await exchangeCodeForToken(
		body.code,
		body.redirect_uri,
		c.env.GITHUB_CLIENT_ID,
		c.env.GITHUB_CLIENT_SECRET,
	);

	if ("error" in tokenResult) {
		logger.warn("GitHub token exchange failed", { error: tokenResult.error });
		return c.json(
			{ error: "token_exchange_failed", message: tokenResult.error },
			401,
		);
	}

	// Fetch GitHub user info
	const user = await fetchGitHubUser(tokenResult.accessToken);
	if (!user) {
		logger.warn("Failed to fetch GitHub user");
		return c.json(
			{ error: "user_fetch_failed", message: "Could not fetch GitHub user" },
			401,
		);
	}

	// Generate Shipyard JWT
	const shipyardToken = await generateSessionToken(user, c.env.JWT_SECRET);

	// Check for mobile
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
