import { DEFAULT_REGISTRY_PORTS } from "./registry-config.mjs";
import { createHash, randomBytes } from "node:crypto";

//#region src/content-hash.ts
/**
* Compute a hash of content for change detection.
* Returns first 16 hex characters of SHA256 hash (64 bits).
*/
function computeHash(content) {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

//#endregion
//#region src/session-token.ts
/**
* Generate a cryptographically secure session token.
* Returns ~43 character base64url string (256 bits of entropy).
*/
function generateSessionToken() {
	return randomBytes(32).toString("base64url");
}
/**
* Hash a session token for storage.
* Uses SHA256 to create a one-way hash.
*/
function hashSessionToken(token) {
	return createHash("sha256").update(token).digest("hex");
}

//#endregion
//#region src/timeouts.ts
/**
* Shared timeout constants for Shipyard services
*/
/**
* Long-polling timeout for approval flow.
* Server waits up to 25 minutes for user approval, client needs buffer.
*/
const APPROVAL_LONG_POLL_TIMEOUT_MS = 1800 * 1e3;
/**
* Default tRPC client timeout for normal operations
*/
const DEFAULT_TRPC_TIMEOUT_MS = 10 * 1e3;

//#endregion
export { APPROVAL_LONG_POLL_TIMEOUT_MS, DEFAULT_REGISTRY_PORTS, DEFAULT_TRPC_TIMEOUT_MS, computeHash, generateSessionToken, hashSessionToken };
//# sourceMappingURL=index.mjs.map