/**
 * Additional Zod schemas for tRPC procedures.
 * Re-exports existing schemas and adds new ones needed for tRPC.
 */

import { z } from 'zod';
import { A2AMessageSchema } from '../conversation-export.js';

// Re-export A2A types for conversation import
export { A2AMessageSchema, ConversationExportMetaSchema } from '../conversation-export.js';
// Re-export existing schemas from hook-api
export {
  CreateHookSessionRequestSchema,
  CreateHookSessionResponseSchema,
  CreateSubscriptionRequestSchema,
  CreateSubscriptionResponseSchema,
  GetReviewStatusResponseSchema,
  UpdatePlanContentRequestSchema,
  UpdatePlanContentResponseSchema,
  UpdatePresenceRequestSchema,
  UpdatePresenceResponseSchema,
} from '../hook-api.js';
// Re-export yjs helpers for plan router
export { getPlanMetadata } from '../yjs-helpers.js';

// --- Plan Router Schemas ---

export const PlanIdSchema = z.object({
  planId: z.string().min(1),
});

export type PlanIdInput = z.infer<typeof PlanIdSchema>;

export const PlanStatusResponseSchema = z.object({
  status: z.string(),
});

export type PlanStatusResponse = z.infer<typeof PlanStatusResponseSchema>;

export const HasConnectionsResponseSchema = z.object({
  hasConnections: z.boolean(),
});

export type HasConnectionsResponse = z.infer<typeof HasConnectionsResponseSchema>;

// --- Subscription Router Schemas ---

export const SubscriptionClientIdSchema = z.object({
  planId: z.string().min(1),
  clientId: z.string().min(1),
});

export type SubscriptionClientIdInput = z.infer<typeof SubscriptionClientIdSchema>;

export const ChangeTypeSchema = z.enum(['status', 'comments', 'resolved', 'content', 'artifacts']);

export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const ChangeSchema = z.object({
  type: ChangeTypeSchema,
  timestamp: z.number(),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type Change = z.infer<typeof ChangeSchema>;

export const ChangesResponseSchema = z.object({
  ready: z.boolean(),
  changes: z.string().optional(),
  details: z.array(ChangeSchema).optional(),
  pending: z.number().optional(),
  windowExpiresIn: z.number().optional(),
});

export type ChangesResponse = z.infer<typeof ChangesResponseSchema>;

export const DeleteSubscriptionResponseSchema = z.object({
  success: z.boolean(),
});

export type DeleteSubscriptionResponse = z.infer<typeof DeleteSubscriptionResponseSchema>;

// Internal type for subscription creation (used by PlanStore)
export interface SubscriptionCreateParams {
  planId: string;
  subscribe: ChangeType[];
  windowMs: number;
  maxWindowMs: number;
  threshold: number;
}

// --- Hook Router Schemas ---

export const SetSessionTokenRequestSchema = z.object({
  sessionTokenHash: z.string().min(1),
});

export type SetSessionTokenRequest = z.infer<typeof SetSessionTokenRequestSchema>;

export const SetSessionTokenResponseSchema = z.object({
  url: z.string(),
});

export type SetSessionTokenResponse = z.infer<typeof SetSessionTokenResponseSchema>;

// --- Conversation Router Schemas ---

export const ImportConversationRequestSchema = z.object({
  a2aMessages: z.array(A2AMessageSchema),
  meta: z
    .object({
      planId: z.string().optional(),
      sourcePlatform: z.string().optional(),
      sessionId: z.string().optional(),
    })
    .optional(),
});

export type ImportConversationRequest = z.infer<typeof ImportConversationRequestSchema>;

export const ImportConversationResponseSchema = z.object({
  success: z.boolean(),
  sessionId: z.string().optional(),
  transcriptPath: z.string().optional(),
  messageCount: z.number().optional(),
  error: z.string().optional(),
});

export type ImportConversationResponse = z.infer<typeof ImportConversationResponseSchema>;
