/**
 * Additional Zod schemas for tRPC procedures.
 * Re-exports existing schemas and adds new ones needed for tRPC.
 */

import { z } from 'zod';
import { A2AMessageSchema } from '../conversation-export.js';
import {
  type ChangeType,
  ChangeTypeSchema,
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

export { A2AMessageSchema, ConversationExportMetaSchema } from '../conversation-export.js';
export {
  ChangeTypeSchema,
  CreateHookSessionRequestSchema,
  CreateHookSessionResponseSchema,
  CreateSubscriptionRequestSchema,
  CreateSubscriptionResponseSchema,
  GetReviewStatusResponseSchema,
  UpdatePlanContentRequestSchema,
  UpdatePlanContentResponseSchema,
  UpdatePresenceRequestSchema,
  UpdatePresenceResponseSchema,
};
export type { ChangeType };
export { LocalChangesResultSchema } from '../local-changes.js';
export { getPlanMetadata } from '../yjs-helpers.js';

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

export const SubscriptionClientIdSchema = z.object({
  planId: z.string().min(1),
  clientId: z.string().min(1),
});

export type SubscriptionClientIdInput = z.infer<typeof SubscriptionClientIdSchema>;

export const ChangeSchema = z.object({
  type: ChangeTypeSchema,
  timestamp: z.number(),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type Change = z.infer<typeof ChangeSchema>;

export const ChangesResponseSchema = z.discriminatedUnion('ready', [
  z.object({
    ready: z.literal(true),
    changes: z.string(),
    details: z.array(ChangeSchema),
  }),
  z.object({
    ready: z.literal(false),
    pending: z.number(),
    windowExpiresIn: z.number(),
  }),
]);

export type ChangesResponse = z.infer<typeof ChangesResponseSchema>;

export const DeleteSubscriptionResponseSchema = z.object({
  success: z.boolean(),
});

export type DeleteSubscriptionResponse = z.infer<typeof DeleteSubscriptionResponseSchema>;

export interface SubscriptionCreateParams {
  planId: string;
  subscribe: ChangeType[];
  windowMs: number;
  maxWindowMs: number;
  threshold: number;
}

export const SetSessionTokenRequestSchema = z.object({
  sessionTokenHash: z.string().min(1),
});

export type SetSessionTokenRequest = z.infer<typeof SetSessionTokenRequestSchema>;

export const GetDeliverableContextRequestSchema = z.object({
  sessionToken: z.string().min(1),
});

export type GetDeliverableContextRequest = z.infer<typeof GetDeliverableContextRequestSchema>;

export const GetDeliverableContextResponseSchema = z.object({
  context: z.string(),
});

export type GetDeliverableContextResponse = z.infer<typeof GetDeliverableContextResponseSchema>;

export const SetSessionTokenResponseSchema = z.object({
  url: z.string(),
});

export type SetSessionTokenResponse = z.infer<typeof SetSessionTokenResponseSchema>;

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

export const ImportConversationResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    sessionId: z.string(),
    transcriptPath: z.string(),
    messageCount: z.number(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type ImportConversationResponse = z.infer<typeof ImportConversationResponseSchema>;

export const MachineInfoResponseSchema = z.object({
  machineId: z.string(),
  machineName: z.string(),
  ownerId: z.string(),
  cwd: z.string(),
});

export type MachineInfoResponse = z.infer<typeof MachineInfoResponseSchema>;
