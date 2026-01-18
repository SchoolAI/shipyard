/**
 * tRPC router for conversation import/export.
 * Handles A2A protocol message conversion and Claude Code session creation.
 */

import type { Logger } from '../context.js';
import { ImportConversationRequestSchema, ImportConversationResponseSchema } from '../schemas.js';
import { publicProcedure, router } from '../trpc.js';

/**
 * Conversation router - handles conversation import from A2A protocol.
 *
 * Handler logic is injected via context since it requires filesystem access
 * and Claude Code specific paths that only the server package knows.
 */
export const conversationRouter = router({
  /**
   * Import a conversation from A2A format into a Claude Code session.
   * POST /api/conversation/import
   */
  import: publicProcedure
    .input(ImportConversationRequestSchema)
    .output(ImportConversationResponseSchema)
    .mutation(async ({ input, ctx }) => {
      // Delegate to handler - implementation provided by server
      const handlers = ctx.conversationHandlers;
      return handlers.importConversation(input, ctx);
    }),
});

/**
 * Minimal context interface required by conversation handlers.
 * This avoids circular dependencies with the full Context type.
 */
export interface ConversationContext {
  logger: Logger;
}

/**
 * Handler interface for conversation operations.
 * Implemented by server package to provide actual business logic.
 */
export interface ConversationHandlers {
  importConversation: (
    input: {
      a2aMessages: unknown[];
      meta?: {
        planId?: string;
        sourcePlatform?: string;
        sessionId?: string;
      };
    },
    ctx: ConversationContext
  ) => Promise<
    | { success: true; sessionId: string; transcriptPath: string; messageCount: number }
    | { success: false; error: string }
  >;
}

export type ConversationRouter = typeof conversationRouter;
