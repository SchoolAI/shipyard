/**
 * tRPC client for communicating with the shipyard registry server.
 * Provides type-safe RPC calls with automatic request batching.
 *
 * NOTE: This client runs in Bun, which has native fetch with proper timeout handling.
 * No need for undici Agent workarounds - Bun's fetch handles long-polling correctly.
 */

import type { AppRouter } from '@shipyard/schema';
import { DEFAULT_TRPC_TIMEOUT_MS } from '@shipyard/shared';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

let cachedClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let cachedBaseUrl: string | null = null;

/**
 * Custom fetch wrapper with timeout for tRPC.
 * Bun's native fetch is functionally compatible with tRPC but has slightly
 * different TypeScript types. We cast to satisfy tRPC's expectations.
 *
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: Bun fetch is compatible with tRPC at runtime, only types differ
const createFetchWithTimeout = (timeoutMs: number): any => {
  return async (url: string | URL, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  };
};

/**
 * Get a tRPC client configured for the given base URL.
 * Caches the client to avoid recreating it on every call.
 *
 * @param baseUrl - The base URL of the registry server
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 */
export function getTRPCClient(baseUrl: string, timeoutMs = DEFAULT_TRPC_TIMEOUT_MS) {
  // NOTE: Don't cache clients with custom timeouts - long-polling needs dedicated instances
  if (timeoutMs !== DEFAULT_TRPC_TIMEOUT_MS) {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${baseUrl}/trpc`,
          fetch: createFetchWithTimeout(timeoutMs),
        }),
      ],
    });
  }

  if (cachedClient && cachedBaseUrl === baseUrl) {
    return cachedClient;
  }

  cachedClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        fetch: createFetchWithTimeout(timeoutMs),
      }),
    ],
  });
  cachedBaseUrl = baseUrl;
  return cachedClient;
}

/**
 * Reset the cached tRPC client.
 * Useful for testing or when the server URL changes.
 */
export function resetTRPCClient() {
  cachedClient = null;
  cachedBaseUrl = null;
}
