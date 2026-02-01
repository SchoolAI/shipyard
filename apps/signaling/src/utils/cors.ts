/**
 * CORS configuration utilities.
 */

import type { Env } from "../env";

/** Production-allowed origins */
export const ALLOWED_ORIGINS_PRODUCTION = [
	"https://shipyard.pages.dev",
	"https://schoolai.github.io",
];

/**
 * Check if origin is allowed based on environment.
 * - Production: strict whitelist
 * - Development: any localhost/127.0.0.1
 */
export function isAllowedOrigin(origin: string | null, env: Env): boolean {
	if (!origin) return false;

	if (env.ENVIRONMENT === "production") {
		return ALLOWED_ORIGINS_PRODUCTION.includes(origin);
	}

	try {
		const url = new URL(origin);
		return url.hostname === "localhost" || url.hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

/**
 * Get CORS headers for a response.
 * Returns null if origin is not allowed.
 */
export function getCorsHeaders(
	origin: string | null,
	env: Env,
): Record<string, string> | null {
	if (!origin || !isAllowedOrigin(origin, env)) {
		return null;
	}

	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, Upgrade, Connection",
		"Access-Control-Max-Age": "86400",
	};
}
