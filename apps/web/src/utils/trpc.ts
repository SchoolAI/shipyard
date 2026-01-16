import type { AppRouter } from '@peer-plan/schema';
import { createTRPCReact } from '@trpc/react-query';

/**
 * tRPC React hooks for use in React components.
 * Provides useQuery, useMutation, etc. with full type safety.
 */
export const trpc = createTRPCReact<AppRouter>();
