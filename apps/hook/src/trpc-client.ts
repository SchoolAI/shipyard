/**
 * tRPC client for communicating with the peer-plan registry server.
 * Provides type-safe RPC calls with automatic request batching.
 */

import type { AppRouter } from '@peer-plan/schema';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

let cachedClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let cachedBaseUrl: string | null = null;

/**
 * Get a tRPC client configured for the given base URL.
 * Caches the client to avoid recreating it on every call.
 *
 * @param baseUrl - The base URL of the registry server
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 */
export function getTRPCClient(baseUrl: string, timeoutMs = 10000) {
  // Don't cache clients with custom timeouts - they're used for specific long-polling operations
  if (timeoutMs !== 10000) {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${baseUrl}/trpc`,
          fetch: (url, options) => {
            return fetch(url, {
              ...options,
              signal: AbortSignal.timeout(timeoutMs),
            });
          },
        }),
      ],
    });
  }

  // Use cached client for default timeout
  if (cachedClient && cachedBaseUrl === baseUrl) {
    return cachedClient;
  }

  cachedClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(timeoutMs),
          });
        },
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
