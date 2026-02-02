/**
 * Session token generation and hashing utilities.
 * Ported from packages/shared-legacy/src/session-token.ts
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure session token.
 * Returns ~43 character base64url string (256 bits of entropy).
 */
export function generateSessionToken(): string {
	return randomBytes(32).toString("base64url");
}

/**
 * Hash a session token for storage.
 * Uses SHA256 to create a one-way hash.
 */
export function hashSessionToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
