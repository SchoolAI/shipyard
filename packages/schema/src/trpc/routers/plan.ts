/**
 * tRPC router for plan status and connection queries.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  getPlanMetadata,
  HasConnectionsResponseSchema,
  LocalChangesResultSchema,
  MachineInfoResponseSchema,
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

  /**
   * Get local git changes for a plan's working directory.
   * Works for plans created via Claude Code or execute_code API (which store origin.cwd).
   * GET /api/plan/:id/local-changes
   */
  getLocalChanges: publicProcedure
    .input(PlanIdSchema)
    .output(LocalChangesResultSchema)
    .query(async ({ input, ctx }) => {
      const doc = await ctx.getOrCreateDoc(input.planId);
      const metadata = getPlanMetadata(doc);

      if (!metadata) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      /**
       * Extract working directory from origin metadata.
       * Claude Code and 'unknown' platforms store cwd - other platforms return undefined.
       */
      const origin = metadata.origin;
      const cwd =
        origin?.platform === 'claude-code' || origin?.platform === 'unknown'
          ? origin.cwd
          : undefined;

      if (!cwd) {
        return {
          available: false as const,
          reason: 'no_cwd' as const,
          message:
            'Plan has no associated working directory. Local changes are only available for plans created with working directory metadata.',
        };
      }

      return ctx.getLocalChanges(cwd);
    }),

  /**
   * Get content of a file from a plan's working directory.
   * Used for viewing untracked files which don't have diff patches.
   */
  getFileContent: publicProcedure
    .input(
      z.object({
        planId: PlanIdSchema.shape.planId,
        filePath: z.string(),
      })
    )
    .output(
      z.object({
        content: z.string().nullable(),
        error: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const doc = await ctx.getOrCreateDoc(input.planId);
      const metadata = getPlanMetadata(doc);

      if (!metadata) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      const origin = metadata.origin;
      const cwd =
        origin?.platform === 'claude-code' || origin?.platform === 'unknown'
          ? origin.cwd
          : undefined;

      if (!cwd) {
        return { content: null, error: 'No working directory available' };
      }

      return ctx.getFileContent(cwd, input.filePath);
    }),

  getMachineInfo: publicProcedure
    .input(PlanIdSchema)
    .output(MachineInfoResponseSchema)
    .query(async ({ ctx }) => {
      return ctx.getMachineInfo();
    }),
});

export type PlanRouter = typeof planRouter;
