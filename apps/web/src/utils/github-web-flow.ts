import { z } from "zod";

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

/**
 * GitHub OAuth worker URL.
 *
 * Uses Vite MODE-based defaults:
 * - development (default): http://localhost:{oauth port from env or 4445}
 * - production: https://shipyard-github-oauth.jacob-191.workers.dev
 *
 * Can be overridden with VITE_GITHUB_OAUTH_WORKER environment variable.
 * In worktrees, this is set by worktree-env.sh to avoid port conflicts.
 */
const WORKER_URL = (() => {
	if (import.meta.env.VITE_GITHUB_OAUTH_WORKER) {
		return import.meta.env.VITE_GITHUB_OAUTH_WORKER;
	}
	if (import.meta.env.MODE === "production") {
		return "https://shipyard-github-oauth.jacob-191.workers.dev";
	}
	return "http://localhost:4445";
})();

/**
 * Schema for GitHub OAuth token exchange error response.
 * SECURITY: GitHub API responses are external data - validate structure.
 */
const OAuthErrorResponseSchema = z.object({
	error: z.string().optional(),
	error_description: z.string().optional(),
});

/**
 * Schema for GitHub OAuth token exchange success response.
 * SECURITY: External API response - validate before use.
 */
const TokenExchangeResponseSchema = z.object({
	access_token: z.string(),
	scope: z.string().optional(),
	is_mobile: z.boolean().optional(),
});

/**
 * Schema for GitHub user API response.
 * SECURITY: External API response - validate before use.
 */
const GitHubUserSchema = z.object({
	login: z.string(),
	name: z.string().nullable(),
	avatar_url: z.string(),
});

export type GitHubUser = z.infer<typeof GitHubUserSchema>;

/**
 * Start GitHub OAuth web flow.
 * @param redirectUri - Where GitHub should redirect after auth
 * @param options.forceAccountPicker - Force GitHub to show account picker
 * @param options.scope - OAuth scope to request (empty for basic identity, 'repo' for private repo access)
 * @param options.forceConsent - Force GitHub to show consent screen (needed for scope upgrades)
 */
export function startWebFlow(
	redirectUri: string,
	options: {
		forceAccountPicker?: boolean;
		scope?: string;
		forceConsent?: boolean;
	} = {},
): void {
	const {
		forceAccountPicker = false,
		scope = "",
		forceConsent = false,
	} = options;

	const state = generateRandomState();
	sessionStorage.setItem("github-oauth-state", state);

	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: redirectUri,
		scope,
		state,
	});

	if (forceAccountPicker) {
		params.append("prompt", "select_account");
	}

	/** Force consent screen when upgrading scopes (otherwise GitHub returns existing token) */
	if (forceConsent && scope) {
		params.append("prompt", "consent");
	}

	window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

export type TokenExchangeResponse = z.infer<typeof TokenExchangeResponseSchema>;

export async function handleCallback(
	code: string,
	state: string,
	redirectUri: string,
): Promise<TokenExchangeResponse> {
	const storedState = sessionStorage.getItem("github-oauth-state");
	if (state !== storedState) {
		throw new Error("Invalid state parameter - possible CSRF attack");
	}
	sessionStorage.removeItem("github-oauth-state");

	const response = await fetch(`${WORKER_URL}/token-exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code, redirect_uri: redirectUri }),
	});

	if (!response.ok) {
		/** Validate error response structure from external API */
		const rawError: unknown = await response.json();
		const errorResult = OAuthErrorResponseSchema.safeParse(rawError);
		const error = errorResult.success
			? errorResult.data
			: { error: "Unknown error" };
		throw new Error(
			error.error_description || error.error || "Token exchange failed",
		);
	}

	/** Validate success response from external API */
	const rawData: unknown = await response.json();
	const result = TokenExchangeResponseSchema.safeParse(rawData);
	if (!result.success) {
		throw new Error("Invalid token exchange response from OAuth server");
	}
	return result.data;
}

export class TokenValidationError extends Error {
	constructor(
		message: string,
		public readonly isInvalidToken: boolean,
	) {
		super(message);
		this.name = "TokenValidationError";
	}
}

export async function getGitHubUser(token: string): Promise<GitHubUser> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github.v3+json",
		},
	});

	if (!response.ok) {
		if (response.status === 401) {
			throw new TokenValidationError(
				"Token is invalid or has been revoked",
				true,
			);
		}
		/** 403 (rate limit), 5xx (server errors) - token might still be valid */
		throw new TokenValidationError(
			`Failed to fetch user info: ${response.status}`,
			false,
		);
	}

	/** Validate GitHub API response */
	const rawData: unknown = await response.json();
	const result = GitHubUserSchema.safeParse(rawData);
	if (!result.success) {
		throw new TokenValidationError("Invalid user data from GitHub API", false);
	}
	return result.data;
}

export type TokenValidationResult =
	| { status: "valid" }
	| { status: "invalid" }
	| { status: "error"; message: string };

export async function validateToken(
	token: string,
): Promise<TokenValidationResult> {
	try {
		await getGitHubUser(token);
		return { status: "valid" };
	} catch (err) {
		if (err instanceof TokenValidationError) {
			if (err.isInvalidToken) {
				return { status: "invalid" };
			}
			/** Server error, rate limit, etc. - don't invalidate the token */
			return { status: "error", message: err.message };
		}
		/** Network error (fetch failed) - don't invalidate the token */
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Network error",
		};
	}
}

function generateRandomState(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
