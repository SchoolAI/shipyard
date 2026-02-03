import type { AppRouter } from "@shipyard/schema";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

/**
 * Create a vanilla tRPC client for non-React contexts.
 * Use this for imperative code outside of React components/hooks.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:32191')
 */
export function createVanillaTRPCClient(baseUrl: string) {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${baseUrl}/trpc`,
				fetch: (url, options) => {
					return fetch(url, {
						...options,
						signal: AbortSignal.timeout(10000),
					});
				},
			}),
		],
	});
}
