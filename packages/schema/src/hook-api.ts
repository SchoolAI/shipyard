/**
 * Shared schemas for hook ↔ server HTTP API communication.
 * These types are used by both @peer-plan/hook and @peer-plan/server.
 */

import { z } from 'zod';

// --- Agent Presence ---

/**
 * Tracks an agent's presence in a plan session.
 */
export const AgentPresenceSchema = z.object({
  /** Type of agent (for display purposes) */
  agentType: z.string(),
  /** Unique session identifier */
  sessionId: z.string(),
  /** When the agent connected (unix timestamp ms) */
  connectedAt: z.number(),
  /** Last activity timestamp (unix timestamp ms) */
  lastSeenAt: z.number(),
});

export type AgentPresence = z.infer<typeof AgentPresenceSchema>;

// --- Review Feedback ---

/**
 * A single comment in a review thread.
 */
export const ReviewCommentSchema = z.object({
  author: z.string(),
  content: z.string(),
  createdAt: z.number(),
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

/**
 * Review feedback for a specific block in the plan.
 */
export const ReviewFeedbackSchema = z.object({
  threadId: z.string(),
  blockId: z.string().optional(),
  comments: z.array(ReviewCommentSchema),
});

export type ReviewFeedback = z.infer<typeof ReviewFeedbackSchema>;

// --- Hook API Request/Response Schemas ---

/**
 * POST /api/hook/session - Create a new plan session
 */
export const CreateHookSessionRequestSchema = z.object({
  sessionId: z.string(),
  agentType: z.string().default('claude-code'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateHookSessionRequest = z.infer<typeof CreateHookSessionRequestSchema>;

export const CreateHookSessionResponseSchema = z.object({
  planId: z.string(),
  url: z.string(),
});

export type CreateHookSessionResponse = z.infer<typeof CreateHookSessionResponseSchema>;

/**
 * PUT /api/hook/plan/:id/content - Update plan content
 */
export const UpdatePlanContentRequestSchema = z.object({
  content: z.string(),
  /** Optional file path for tracking which file is being synced */
  filePath: z.string().optional(),
});

export type UpdatePlanContentRequest = z.infer<typeof UpdatePlanContentRequestSchema>;

export const UpdatePlanContentResponseSchema = z.object({
  success: z.boolean(),
  updatedAt: z.number(),
});

export type UpdatePlanContentResponse = z.infer<typeof UpdatePlanContentResponseSchema>;

/**
 * GET /api/hook/plan/:id/review - Get review status
 */
export const GetReviewStatusResponseSchema = z.object({
  status: z.enum([
    'draft',
    'pending_review',
    'approved',
    'changes_requested',
    'in_progress',
    'completed',
  ]),
  reviewedAt: z.number().optional(),
  reviewedBy: z.string().optional(),
  reviewComment: z.string().optional(),
  feedback: z.array(ReviewFeedbackSchema).optional(),
});

export type GetReviewStatusResponse = z.infer<typeof GetReviewStatusResponseSchema>;

/**
 * POST /api/hook/plan/:id/presence - Update agent presence
 */
export const UpdatePresenceRequestSchema = z.object({
  agentType: z.string(),
  sessionId: z.string(),
});

export type UpdatePresenceRequest = z.infer<typeof UpdatePresenceRequestSchema>;

export const UpdatePresenceResponseSchema = z.object({
  success: z.boolean(),
});

export type UpdatePresenceResponse = z.infer<typeof UpdatePresenceResponseSchema>;

/**
 * Error response from hook API
 */
export const HookApiErrorSchema = z.object({
  error: z.string(),
});

export type HookApiError = z.infer<typeof HookApiErrorSchema>;

// --- Registry API Schemas (for WebSocket server registration) ---

/**
 * POST /register - Register a WebSocket server
 */
export const RegisterServerRequestSchema = z.object({
  port: z.number().int().positive(),
  pid: z.number().int().positive(),
});

export type RegisterServerRequest = z.infer<typeof RegisterServerRequestSchema>;

export const RegisterServerResponseSchema = z.object({
  success: z.boolean(),
  entry: z.object({
    port: z.number(),
    pid: z.number(),
    url: z.string(),
    registeredAt: z.number(),
  }),
});

export type RegisterServerResponse = z.infer<typeof RegisterServerResponseSchema>;

/**
 * DELETE /unregister - Unregister a WebSocket server
 */
export const UnregisterServerRequestSchema = z.object({
  pid: z.number().int().positive(),
});

export type UnregisterServerRequest = z.infer<typeof UnregisterServerRequestSchema>;

export const UnregisterServerResponseSchema = z.object({
  success: z.boolean(),
  existed: z.boolean(),
});

export type UnregisterServerResponse = z.infer<typeof UnregisterServerResponseSchema>;

// --- Subscription API Schemas ---

/**
 * POST /api/plan/:id/subscribe - Create a subscription
 */
export const CreateSubscriptionRequestSchema = z.object({
  subscribe: z.array(z.string()).optional(),
  windowMs: z.number().positive().optional(),
  maxWindowMs: z.number().positive().optional(),
  threshold: z.number().positive().optional(),
});

export type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;

export const CreateSubscriptionResponseSchema = z.object({
  clientId: z.string(),
});

export type CreateSubscriptionResponse = z.infer<typeof CreateSubscriptionResponseSchema>;
