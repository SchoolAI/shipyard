/**
 * tRPC router for plan status and connection queries.
 */

import { TRPCError } from '@trpc/server';
import {
  getPlanMetadata,
  HasConnectionsResponseSchema,
  PlanIdSchema,
  PlanStatusResponseSchema,
} from '../schemas.js';
import { publicProcedure, router } from '../trpc.js';

/**
 * Plan router - queries plan status and connection state.
 */
export const planRouter = router({
  /**
   * Get the current status of a plan.
   * GET /api/plan/:id/status
   */
  getStatus: publicProcedure
    .input(PlanIdSchema)
    .output(PlanStatusResponseSchema)
    .query(async ({ input, ctx }) => {
      const doc = await ctx.getOrCreateDoc(input.planId);
      const metadata = getPlanMetadata(doc);

      if (!metadata) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      return { status: metadata.status };
    }),

  /**
   * Check if a plan has any active WebSocket connections.
   * Used to avoid opening duplicate browser tabs.
   * GET /api/plan/:id/has-connections
   */
  hasConnections: publicProcedure
    .input(PlanIdSchema)
    .output(HasConnectionsResponseSchema)
    .query(async ({ input, ctx }) => {
      const planStore = ctx.getPlanStore();
      const hasConnections = await planStore.hasActiveConnections(input.planId);
      return { hasConnections };
    }),
});

export type PlanRouter = typeof planRouter;
