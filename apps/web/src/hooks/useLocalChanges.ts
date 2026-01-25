/**
 * Hook to fetch local git changes for a plan's working directory.
 * Calls the tRPC endpoint which runs git commands on the MCP server.
 */
import type { LocalChangesResult } from '@shipyard/schema';
import { trpc } from '@/utils/trpc';

interface UseLocalChangesOptions {
  /** Whether the query should be enabled */
  enabled?: boolean;
}

interface UseLocalChangesReturn {
  /** The local changes data */
  data: LocalChangesResult | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Whether the query is currently fetching (including background refetches) */
  isFetching: boolean;
  /** Error if the query failed */
  error: unknown;
  /** Refetch the local changes */
  refetch: () => void;
}

/**
 * Fetch local git changes for a plan.
 * Only works for plans created via Claude Code (which stores origin.cwd).
 *
 * @param planId - The plan ID to fetch changes for
 * @param options - Query options
 */
export function useLocalChanges(
  planId: string,
  options: UseLocalChangesOptions = {}
): UseLocalChangesReturn {
  const { enabled = true } = options;

  const query = trpc.plan.getLocalChanges.useQuery(
    { planId },
    {
      enabled,
      // Always refetch when the query becomes enabled (e.g., tab switch)
      staleTime: 0,
      // Refetch when window gains focus
      refetchOnWindowFocus: true,
      // Don't retry on failure (usually means MCP not connected)
      retry: false,
      // Short timeout since this is a local operation
      // Note: This is set in the tRPC client config, not here
    }
  );

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
