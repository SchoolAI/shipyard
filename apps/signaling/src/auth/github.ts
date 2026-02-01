/**
 * GitHub API helpers for OAuth flow.
 */

import { z } from "zod";
import type { GitHubUser } from "./types";

/** Schema for GitHub OAuth token response */
const GitHubTokenResponseSchema = z.object({
	access_token: z.string().optional(),
	error: z.string().optional(),
	error_description: z.string().optional(),
});

/** Schema for GitHub user API response */
const GitHubUserResponseSchema = z.object({
	id: z.number(),
	login: z.string(),
	name: z.string().nullable().optional(),
	avatar_url: z.string().optional(),
});

/** GitHub OAuth token endpoint */
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

/** GitHub user API endpoint */
const GITHUB_USER_URL = "https://api.github.com/user";

/**
 * Exchange OAuth authorization code for GitHub access token.
 */
export async function exchangeCodeForToken(
	code: string,
	redirectUri: string,
	clientId: string,
	clientSecret: string,
): Promise<{ accessToken: string } | { error: string }> {
	try {
		const response = await fetch(GITHUB_TOKEN_URL, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"User-Agent": "shipyard-signaling-worker",
			},
			body: JSON.stringify({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: redirectUri,
			}),
		});

		if (!response.ok) {
			return { error: `GitHub API error: ${response.status}` };
		}

		const json: unknown = await response.json();
		const parseResult = GitHubTokenResponseSchema.safeParse(json);
		if (!parseResult.success) {
			return { error: "Invalid token response format" };
		}

		const data = parseResult.data;
		if (data.error) {
			return { error: data.error_description ?? data.error };
		}

		if (!data.access_token) {
			return { error: "No access token in response" };
		}

		return { accessToken: data.access_token };
	} catch (err) {
		return { error: `Token exchange failed: ${err}` };
	}
}

/**
 * Fetch GitHub user info using access token.
 */
export async function fetchGitHubUser(
	accessToken: string,
): Promise<GitHubUser | null> {
	try {
		const response = await fetch(GITHUB_USER_URL, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "shipyard-signaling-worker",
			},
		});

		if (!response.ok) {
			return null;
		}

		const json: unknown = await response.json();
		const parseResult = GitHubUserResponseSchema.safeParse(json);
		if (!parseResult.success) {
			return null;
		}

		const data = parseResult.data;
		return {
			id: data.id,
			login: data.login,
			name: data.name ?? undefined,
			avatar_url: data.avatar_url,
		};
	} catch {
		return null;
	}
}

/**
 * Detect if request is from a mobile device.
 * Used to prevent deep linking issues on mobile.
 */
export function isMobileUserAgent(userAgent: string | null): boolean {
	if (!userAgent) return false;
	return /iPhone|iPad|iPod|Android/i.test(userAgent);
}
