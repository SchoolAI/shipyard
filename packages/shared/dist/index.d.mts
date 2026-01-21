import { DEFAULT_REGISTRY_PORTS } from "./registry-config.mjs";

//#region src/content-hash.d.ts

/**
 * Compute a hash of content for change detection.
 * Returns first 16 hex characters of SHA256 hash (64 bits).
 */
declare function computeHash(content: string): string;
//#endregion
//#region src/session-token.d.ts
/**
 * Generate a cryptographically secure session token.
 * Returns ~43 character base64url string (256 bits of entropy).
 */
declare function generateSessionToken(): string;
/**
 * Hash a session token for storage.
 * Uses SHA256 to create a one-way hash.
 */
declare function hashSessionToken(token: string): string;
//#endregion
//#region src/timeouts.d.ts
/**
 * Shared timeout constants for Shipyard services
 */
/**
 * Long-polling timeout for approval flow.
 * Server waits up to 25 minutes for user approval, client needs buffer.
 */
declare const APPROVAL_LONG_POLL_TIMEOUT_MS: number;
/**
 * Default tRPC client timeout for normal operations
 */
declare const DEFAULT_TRPC_TIMEOUT_MS: number;
//#endregion
export { APPROVAL_LONG_POLL_TIMEOUT_MS, DEFAULT_REGISTRY_PORTS, DEFAULT_TRPC_TIMEOUT_MS, computeHash, generateSessionToken, hashSessionToken };
//# sourceMappingURL=index.d.mts.map