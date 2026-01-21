/**
 * tRPC client for communicating with the shipyard registry server.
 * Provides type-safe RPC calls with automatic request batching.
 */

import type { AppRouter } from '@shipyard/schema';
import { DEFAULT_TRPC_TIMEOUT_MS } from '@shipyard/shared';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { Agent } from 'undici';

let cachedClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let cachedBaseUrl: string | null = null;

/**
 * Create a custom undici Agent for long-polling requests.
 * Node.js fetch (undici) has internal timeouts separate from AbortSignal:
 * - headersTimeout: Time to receive response headers (default: 300s = 5 min)
 * - bodyTimeout: Time to receive response body (default: 300s = 5 min)
 *
 * For long-polling (waiting for user approval), we need to extend these
 * to match our 30-minute approval timeout.
 */
function createLongPollingAgent(timeoutMs: number): Agent {
  return new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    keepAliveTimeout: timeoutMs,
    keepAliveMaxTimeout: timeoutMs,
  });
}

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
    const agent = createLongPollingAgent(timeoutMs);

    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${baseUrl}/trpc`,
          fetch: (url, options) => {
            return fetch(url, {
              ...options,
              signal: AbortSignal.timeout(timeoutMs),
              dispatcher: agent,
            });
          },
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
