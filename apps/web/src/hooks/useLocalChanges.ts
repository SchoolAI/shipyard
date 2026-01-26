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
      staleTime: 0,
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
      retry: false,
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
