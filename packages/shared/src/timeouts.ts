/**
 * Shared timeout constants for Shipyard services
 */

/**
 * Long-polling timeout for approval flow.
 * Server waits up to 25 minutes for user approval, client needs buffer.
 */
export const APPROVAL_LONG_POLL_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Default tRPC client timeout for normal operations
 */
export const DEFAULT_TRPC_TIMEOUT_MS = 10 * 1000;
