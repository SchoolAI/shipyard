/**
 * Route helper utilities for reducing boilerplate in Hono routes.
 *
 * These utilities centralize common patterns like JSON parsing, token validation,
 * and error response formatting.
 *
 * @module utils/route-helpers
 */

import type { Context } from "hono";
import type { ZodError, ZodSchema } from "zod";

/**
 * Result type for operations that can fail with a Response.
 * Use pattern matching: `if (!result.ok) return result.error;`
 */
export type RouteResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: Response };

/**
 * Standard error response codes used throughout the API.
 */
export const ErrorCodes = {
	INVALID_BODY: "invalid_body",
	VALIDATION_ERROR: "validation_error",
	UNAUTHORIZED: "unauthorized",
	INVALID_TOKEN: "invalid_token",
	MISSING_TOKEN: "missing_token",
	FORBIDDEN: "forbidden",
	UPGRADE_REQUIRED: "upgrade_required",
	EXPIRED: "expired",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Create a JSON error response.
 *
 * @example
 * ```ts
 * return errorResponse(c, ErrorCodes.UNAUTHORIZED, "Bearer token required", 401);
 * ```
 */
export function errorResponse(
	c: Context,
	error: string,
	message: string,
	status: 400 | 401 | 403 | 404 | 426 | 500,
): Response {
	return c.json({ error, message }, status);
}

/**
 * Create a validation error response with Zod error details.
 *
 * @example
 * ```ts
 * const result = schema.safeParse(body);
 * if (!result.success) {
 *   return validationErrorResponse(c, result.error);
 * }
 * ```
 */
export function validationErrorResponse(
	c: Context,
	zodError: ZodError,
): Response {
	const firstIssue = zodError.issues[0];
	return c.json(
		{
			error: ErrorCodes.VALIDATION_ERROR,
			message: firstIssue?.message ?? "Invalid request body",
			details: zodError.issues,
		},
		400,
	);
}

/**
 * Parse JSON body from request with error handling.
 *
 * Returns a RouteResult that can be pattern matched:
 * - Success: `{ ok: true, value: body }`
 * - Failure: `{ ok: false, error: Response }`
 *
 * @example
 * ```ts
 * const bodyResult = await parseJsonBody(c);
 * if (!bodyResult.ok) return bodyResult.error;
 * const body = bodyResult.value;
 * ```
 */
export async function parseJsonBody(c: Context): Promise<RouteResult<unknown>> {
	try {
		const body = await c.req.json();
		return { ok: true, value: body };
	} catch {
		return {
			ok: false,
			error: errorResponse(
				c,
				ErrorCodes.INVALID_BODY,
				"Invalid JSON body",
				400,
			),
		};
	}
}

/**
 * Parse and validate JSON body against a Zod schema.
 *
 * Combines JSON parsing and schema validation in one call.
 *
 * @example
 * ```ts
 * const result = await parseAndValidateBody(c, MySchema);
 * if (!result.ok) return result.error;
 * const data = result.value; // Typed as z.infer<typeof MySchema>
 * ```
 */
export async function parseAndValidateBody<T>(
	c: Context,
	schema: ZodSchema<T>,
): Promise<RouteResult<T>> {
	const bodyResult = await parseJsonBody(c);
	if (!bodyResult.ok) return bodyResult;

	const parseResult = schema.safeParse(bodyResult.value);
	if (!parseResult.success) {
		return {
			ok: false,
			error: validationErrorResponse(c, parseResult.error),
		};
	}

	return { ok: true, value: parseResult.data };
}

/**
 * Extract Bearer token from Authorization header.
 *
 * @example
 * ```ts
 * const tokenResult = extractBearerToken(c);
 * if (!tokenResult.ok) return tokenResult.error;
 * const token = tokenResult.value;
 * ```
 */
export function extractBearerToken(c: Context): RouteResult<string> {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return {
			ok: false,
			error: errorResponse(
				c,
				ErrorCodes.UNAUTHORIZED,
				"Bearer token required",
				401,
			),
		};
	}

	return { ok: true, value: authHeader.slice(7) };
}

/**
 * Get required query parameter with error handling.
 *
 * @example
 * ```ts
 * const tokenResult = requireQueryParam(c, "token");
 * if (!tokenResult.ok) return tokenResult.error;
 * const token = tokenResult.value;
 * ```
 */
export function requireQueryParam(
	c: Context,
	param: string,
): RouteResult<string> {
	const value = c.req.query(param);
	if (!value) {
		return {
			ok: false,
			error: errorResponse(
				c,
				ErrorCodes.MISSING_TOKEN,
				`${param} query param required`,
				401,
			),
		};
	}

	return { ok: true, value };
}

/**
 * Verify WebSocket upgrade header is present.
 *
 * @example
 * ```ts
 * const upgradeResult = requireWebSocketUpgrade(c);
 * if (!upgradeResult.ok) return upgradeResult.error;
 * ```
 */
export function requireWebSocketUpgrade(c: Context): RouteResult<void> {
	const upgradeHeader = c.req.header("Upgrade");
	if (upgradeHeader !== "websocket") {
		return {
			ok: false,
			error: errorResponse(
				c,
				ErrorCodes.UPGRADE_REQUIRED,
				"WebSocket upgrade required",
				426,
			),
		};
	}

	return { ok: true, value: undefined };
}

/**
 * Create invalid token error response.
 *
 * Use when token validation fails (JWT expired, invalid signature, etc.)
 */
export function invalidTokenResponse(c: Context): Response {
	return errorResponse(
		c,
		ErrorCodes.INVALID_TOKEN,
		"Invalid or expired token",
		401,
	);
}

/**
 * Create forbidden error response.
 *
 * Use when token is valid but user lacks permission.
 */
export function forbiddenResponse(c: Context, message: string): Response {
	return errorResponse(c, ErrorCodes.FORBIDDEN, message, 403);
}

/**
 * Create expired error response.
 *
 * Use for time-limited resources (pre-signed URLs, etc.)
 */
export function expiredResponse(c: Context, message: string): Response {
	return errorResponse(c, ErrorCodes.EXPIRED, message, 401);
}
