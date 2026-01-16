/**
 * tRPC router for hook API endpoints.
 * These endpoints are called by the Claude Code hook to manage plan sessions.
 */

import type * as Y from 'yjs';
import type { z } from 'zod';
import type { Logger } from '../context.js';
import {
  CreateHookSessionRequestSchema,
  CreateHookSessionResponseSchema,
  GetReviewStatusResponseSchema,
  PlanIdSchema,
  SetSessionTokenRequestSchema,
  SetSessionTokenResponseSchema,
  UpdatePlanContentRequestSchema,
  UpdatePlanContentResponseSchema,
  UpdatePresenceRequestSchema,
  UpdatePresenceResponseSchema,
} from '../schemas.js';
import { publicProcedure, router } from '../trpc.js';

/**
 * Hook router - manages plan sessions from Claude Code hook.
 *
 * Handler logic is injected via context to keep this router package-agnostic.
 * The actual business logic lives in the server package's hook-handlers.ts.
 */
export const hookRouter = router({
  /**
   * Create a new plan session.
   * POST /api/hook/session
   */
  createSession: publicProcedure
    .input(CreateHookSessionRequestSchema)
    .output(CreateHookSessionResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Delegate to handler - implementation provided by server
      const handlers = ctx.hookHandlers;
      return handlers.createSession(input, ctx);
    }),

  /**
   * Update plan content with markdown.
   * PUT /api/hook/plan/:id/content
   */
  updateContent: publicProcedure
    .input(PlanIdSchema.merge(UpdatePlanContentRequestSchema))
    .output(UpdatePlanContentResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { planId, ...contentInput } = input;
      const handlers = ctx.hookHandlers;
      return handlers.updateContent(planId, contentInput, ctx);
    }),

  /**
   * Get review status for a plan.
   * GET /api/hook/plan/:id/review
   */
  getReviewStatus: publicProcedure
    .input(PlanIdSchema)
    .output(GetReviewStatusResponseSchema)
    .query(async ({ input, ctx }) => {
      const handlers = ctx.hookHandlers;
      return handlers.getReviewStatus(input.planId, ctx);
    }),

  /**
   * Update agent presence in a plan.
   * POST /api/hook/plan/:id/presence
   */
  updatePresence: publicProcedure
    .input(PlanIdSchema.merge(UpdatePresenceRequestSchema))
    .output(UpdatePresenceResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { planId, ...presenceInput } = input;
      const handlers = ctx.hookHandlers;
      return handlers.updatePresence(planId, presenceInput, ctx);
    }),

  /**
   * Set session token for a plan.
   * POST /api/hook/plan/:id/session-token
   */
  setSessionToken: publicProcedure
    .input(PlanIdSchema.merge(SetSessionTokenRequestSchema))
    .output(SetSessionTokenResponseSchema)
    .mutation(async ({ input, ctx }) => {
      const { planId, sessionTokenHash } = input;
      const handlers = ctx.hookHandlers;
      return handlers.setSessionToken(planId, sessionTokenHash, ctx);
    }),
});

/**
 * Minimal context interface required by hook handlers.
 * This avoids circular dependencies with the full Context type.
 */
export interface HookContext {
  getOrCreateDoc: (planId: string) => Promise<Y.Doc>;
  logger: Logger;
}

/**
 * Handler interface for hook operations.
 * Implemented by server package to provide actual business logic.
 */
export interface HookHandlers {
  createSession: (
    input: z.infer<typeof CreateHookSessionRequestSchema>,
    ctx: HookContext
  ) => Promise<z.infer<typeof CreateHookSessionResponseSchema>>;

  updateContent: (
    planId: string,
    input: z.infer<typeof UpdatePlanContentRequestSchema>,
    ctx: HookContext
  ) => Promise<z.infer<typeof UpdatePlanContentResponseSchema>>;

  getReviewStatus: (
    planId: string,
    ctx: HookContext
  ) => Promise<z.infer<typeof GetReviewStatusResponseSchema>>;

  updatePresence: (
    planId: string,
    input: z.infer<typeof UpdatePresenceRequestSchema>,
    ctx: HookContext
  ) => Promise<z.infer<typeof UpdatePresenceResponseSchema>>;

  setSessionToken: (
    planId: string,
    sessionTokenHash: string,
    ctx: HookContext
  ) => Promise<z.infer<typeof SetSessionTokenResponseSchema>>;
}

export type HookRouter = typeof hookRouter;
