/**
 * Server-side epoch configuration.
 *
 * The minimum epoch is set via SHIPYARD_EPOCH environment variable.
 * When you increase this value and restart the server, ALL clients
 * with older epochs are rejected and forced to clear their storage.
 *
 * Usage:
 *   SHIPYARD_EPOCH=2 pnpm dev:all
 *
 * This guarantees a clean slate - no client can connect without
 * matching the server's epoch.
 */

import { DEFAULT_EPOCH } from '@shipyard/loro-schema';

/**
 * Get the minimum epoch from environment variable.
 * Defaults to DEFAULT_EPOCH (1) if not set.
 *
 * Set SHIPYARD_EPOCH=2 (or higher) to force all clients to reset.
 */
export function getMinimumEpoch(): number {
  const envValue = process.env.SHIPYARD_EPOCH;
  if (envValue) {
    const parsed = Number.parseInt(envValue, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return DEFAULT_EPOCH;
}
