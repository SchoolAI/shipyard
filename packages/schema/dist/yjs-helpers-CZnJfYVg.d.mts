import { Artifact, ConversationVersion, Deliverable, LinkedPR, OriginMetadata, PRReviewComment, PlanEvent, PlanEventType, PlanMetadata, PlanSnapshot, PlanStatusType } from "./plan.mjs";
import { z } from "zod";
import * as Y from "yjs";

//#region src/hook-api.d.ts

/**
 * Tracks an agent's presence in a plan session.
 */
declare const AgentPresenceSchema: z.ZodObject<{
  agentType: z.ZodString;
  sessionId: z.ZodString;
  connectedAt: z.ZodNumber;
  lastSeenAt: z.ZodNumber;
}, z.core.$strip>;
type AgentPresence = z.infer<typeof AgentPresenceSchema>;
/**
 * A single comment in a review thread.
 */
declare const ReviewCommentSchema: z.ZodObject<{
  author: z.ZodString;
  content: z.ZodString;
  createdAt: z.ZodNumber;
}, z.core.$strip>;
type ReviewComment = z.infer<typeof ReviewCommentSchema>;
/**
 * Review feedback for a specific block in the plan.
 */
declare const ReviewFeedbackSchema: z.ZodObject<{
  threadId: z.ZodString;
  blockId: z.ZodOptional<z.ZodString>;
  comments: z.ZodArray<z.ZodObject<{
    author: z.ZodString;
    content: z.ZodString;
    createdAt: z.ZodNumber;
  }, z.core.$strip>>;
}, z.core.$strip>;
type ReviewFeedback = z.infer<typeof ReviewFeedbackSchema>;
/**
 * POST /api/hook/session - Create a new plan session
 */
declare const CreateHookSessionRequestSchema: z.ZodObject<{
  sessionId: z.ZodString;
  agentType: z.ZodDefault<z.ZodString>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
type CreateHookSessionRequest = z.infer<typeof CreateHookSessionRequestSchema>;
declare const CreateHookSessionResponseSchema: z.ZodObject<{
  planId: z.ZodString;
  url: z.ZodString;
}, z.core.$strip>;
type CreateHookSessionResponse = z.infer<typeof CreateHookSessionResponseSchema>;
/**
 * PUT /api/hook/plan/:id/content - Update plan content
 */
declare const UpdatePlanContentRequestSchema: z.ZodObject<{
  content: z.ZodString;
  filePath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type UpdatePlanContentRequest = z.infer<typeof UpdatePlanContentRequestSchema>;
declare const UpdatePlanContentResponseSchema: z.ZodObject<{
  success: z.ZodBoolean;
  updatedAt: z.ZodNumber;
}, z.core.$strip>;
type UpdatePlanContentResponse = z.infer<typeof UpdatePlanContentResponseSchema>;
/**
 * GET /api/hook/plan/:id/review - Get review status
 * Uses discriminated union to match PlanMetadata structure
 */
declare const GetReviewStatusResponseSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  status: z.ZodLiteral<"draft">;
}, z.core.$strip>, z.ZodObject<{
  status: z.ZodLiteral<"pending_review">;
  reviewRequestId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  status: z.ZodLiteral<"changes_requested">;
  reviewedAt: z.ZodNumber;
  reviewedBy: z.ZodString;
  reviewComment: z.ZodOptional<z.ZodString>;
  feedback: z.ZodOptional<z.ZodArray<z.ZodObject<{
    threadId: z.ZodString;
    blockId: z.ZodOptional<z.ZodString>;
    comments: z.ZodArray<z.ZodObject<{
      author: z.ZodString;
      content: z.ZodString;
      createdAt: z.ZodNumber;
    }, z.core.$strip>>;
  }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
  status: z.ZodLiteral<"in_progress">;
  reviewedAt: z.ZodNumber;
  reviewedBy: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  status: z.ZodLiteral<"completed">;
  completedAt: z.ZodNumber;
  completedBy: z.ZodString;
  snapshotUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "status">;
type GetReviewStatusResponse = z.infer<typeof GetReviewStatusResponseSchema>;
/**
 * POST /api/hook/plan/:id/presence - Update agent presence
 */
declare const UpdatePresenceRequestSchema: z.ZodObject<{
  agentType: z.ZodString;
  sessionId: z.ZodString;
}, z.core.$strip>;
type UpdatePresenceRequest = z.infer<typeof UpdatePresenceRequestSchema>;
declare const UpdatePresenceResponseSchema: z.ZodObject<{
  success: z.ZodBoolean;
}, z.core.$strip>;
type UpdatePresenceResponse = z.infer<typeof UpdatePresenceResponseSchema>;
/**
 * Error response from hook API
 */
declare const HookApiErrorSchema: z.ZodObject<{
  error: z.ZodString;
}, z.core.$strip>;
type HookApiError = z.infer<typeof HookApiErrorSchema>;
/**
 * POST /register - Register a WebSocket server
 */
declare const RegisterServerRequestSchema: z.ZodObject<{
  port: z.ZodNumber;
  pid: z.ZodNumber;
}, z.core.$strip>;
type RegisterServerRequest = z.infer<typeof RegisterServerRequestSchema>;
declare const RegisterServerResponseSchema: z.ZodObject<{
  success: z.ZodBoolean;
  entry: z.ZodObject<{
    port: z.ZodNumber;
    pid: z.ZodNumber;
    url: z.ZodString;
    registeredAt: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>;
type RegisterServerResponse = z.infer<typeof RegisterServerResponseSchema>;
/**
 * DELETE /unregister - Unregister a WebSocket server
 */
declare const UnregisterServerRequestSchema: z.ZodObject<{
  pid: z.ZodNumber;
}, z.core.$strip>;
type UnregisterServerRequest = z.infer<typeof UnregisterServerRequestSchema>;
declare const UnregisterServerResponseSchema: z.ZodObject<{
  success: z.ZodBoolean;
  existed: z.ZodBoolean;
}, z.core.$strip>;
type UnregisterServerResponse = z.infer<typeof UnregisterServerResponseSchema>;
/**
 * POST /api/plan/:id/subscribe - Create a subscription
 */
declare const CreateSubscriptionRequestSchema: z.ZodObject<{
  subscribe: z.ZodOptional<z.ZodArray<z.ZodString>>;
  windowMs: z.ZodOptional<z.ZodNumber>;
  maxWindowMs: z.ZodOptional<z.ZodNumber>;
  threshold: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type CreateSubscriptionRequest = z.infer<typeof CreateSubscriptionRequestSchema>;
declare const CreateSubscriptionResponseSchema: z.ZodObject<{
  clientId: z.ZodString;
}, z.core.$strip>;
type CreateSubscriptionResponse = z.infer<typeof CreateSubscriptionResponseSchema>;
//#endregion
//#region src/yjs-helpers.d.ts
/**
 * Fields that can be safely updated without changing status.
 * These are the common base fields that don't have invariants with status.
 */
interface PlanMetadataBaseUpdate {
  title?: string;
  repo?: string;
  pr?: number;
  ownerId?: string;
  approvalRequired?: boolean;
  approvedUsers?: string[];
  rejectedUsers?: string[];
  sessionTokenHash?: string;
  archivedAt?: number;
  archivedBy?: string;
  origin?: OriginMetadata;
  viewedBy?: Record<string, number>;
  conversationVersions?: ConversationVersion[];
  events?: PlanEvent[];
  tags?: string[];
}
/**
 * Valid status transitions in the plan lifecycle.
 *
 * Flow: draft -> (pending_review | in_progress) <-> changes_requested -> in_progress -> completed
 *
 * Plans can go directly from draft to in_progress if approval is not required.
 * Plans requiring approval must go through: draft -> pending_review -> in_progress.
 *
 * Each transition requires specific fields to be provided.
 */
declare const VALID_STATUS_TRANSITIONS: Record<PlanStatusType, PlanStatusType[]>;
/**
 * Type for transitioning to pending_review status.
 */
interface TransitionToPendingReview {
  status: 'pending_review';
  reviewRequestId: string;
}
/**
 * Type for transitioning to changes_requested status.
 */
interface TransitionToChangesRequested {
  status: 'changes_requested';
  reviewedAt: number;
  reviewedBy: string;
  reviewComment?: string;
}
/**
 * Type for transitioning to in_progress status.
 * When coming from pending_review, requires review fields.
 * When coming from draft (no approval required), review fields are optional.
 */
interface TransitionToInProgress {
  status: 'in_progress';
  reviewedAt?: number;
  reviewedBy?: string;
  reviewComment?: string;
}
/**
 * Type for transitioning to completed status.
 */
interface TransitionToCompleted {
  status: 'completed';
  completedAt: number;
  completedBy: string;
  snapshotUrl?: string;
}
/**
 * Union of all valid status transitions.
 */
type StatusTransition = TransitionToPendingReview | TransitionToChangesRequested | TransitionToInProgress | TransitionToCompleted;
/**
 * Result type for status transition operations.
 */
type TransitionResult = {
  success: true;
} | {
  success: false;
  error: string;
};
/**
 * Result type for getPlanMetadata with validation errors.
 */
type GetPlanMetadataResult = {
  success: true;
  data: PlanMetadata;
} | {
  success: false;
  error: string;
};
/**
 * Get plan metadata from Y.Doc with validation.
 * @returns PlanMetadata if valid, null if data is missing or invalid.
 * @deprecated Use getPlanMetadataWithValidation for error details.
 */
declare function getPlanMetadata(ydoc: Y.Doc): PlanMetadata | null;
/**
 * Get plan metadata from Y.Doc with detailed validation errors.
 * Surfaces corruption errors instead of silently swallowing them.
 */
declare function getPlanMetadataWithValidation(ydoc: Y.Doc): GetPlanMetadataResult;
/**
 * Update plan metadata base fields (non-status fields).
 * Use transitionPlanStatus() for status changes.
 *
 * This function only allows updating fields that don't have status invariants.
 * Status changes must go through transitionPlanStatus() to ensure valid transitions.
 */
declare function setPlanMetadata(ydoc: Y.Doc, metadata: PlanMetadataBaseUpdate, actor?: string): void;
/**
 * Transition plan status with state machine validation.
 * Enforces valid status transitions and ensures required fields are provided.
 *
 * Valid transitions:
 * - draft -> pending_review (requires reviewRequestId)
 * - pending_review -> in_progress (requires reviewedAt, reviewedBy)
 * - pending_review -> changes_requested (requires reviewedAt, reviewedBy, optional reviewComment)
 * - changes_requested -> pending_review (requires reviewRequestId)
 * - in_progress -> completed (requires completedAt, completedBy, optional snapshotUrl)
 */
declare function transitionPlanStatus(ydoc: Y.Doc, transition: StatusTransition, actor?: string): TransitionResult;
/**
 * Initialize plan metadata for a new draft plan.
 * Only creates plans in 'draft' status - use transitionPlanStatus() to change status.
 *
 * Note: This function is intentionally restricted to draft status.
 * Other statuses require specific fields (reviewRequestId for pending_review, etc.)
 * that should be set via transitionPlanStatus() for proper validation.
 */
interface InitPlanMetadataParams {
  id: string;
  title: string;
  repo?: string;
  pr?: number;
  ownerId?: string;
  approvalRequired?: boolean;
  sessionTokenHash?: string;
  origin?: OriginMetadata;
  tags?: string[];
}
declare function initPlanMetadata(ydoc: Y.Doc, init: InitPlanMetadataParams): void;
declare function getStepCompletions(ydoc: Y.Doc): Map<string, boolean>;
declare function toggleStepCompletion(ydoc: Y.Doc, stepId: string, actor?: string): void;
declare function isStepCompleted(ydoc: Y.Doc, stepId: string): boolean;
declare function getArtifacts(ydoc: Y.Doc): Artifact[];
declare function addArtifact(ydoc: Y.Doc, artifact: Artifact, actor?: string): void;
declare function removeArtifact(ydoc: Y.Doc, artifactId: string): boolean;
declare function getAgentPresences(ydoc: Y.Doc): Map<string, AgentPresence>;
declare function setAgentPresence(ydoc: Y.Doc, presence: AgentPresence, actor?: string): void;
declare function clearAgentPresence(ydoc: Y.Doc, sessionId: string): boolean;
declare function getAgentPresence(ydoc: Y.Doc, sessionId: string): AgentPresence | null;
declare function getDeliverables(ydoc: Y.Doc): Deliverable[];
declare function addDeliverable(ydoc: Y.Doc, deliverable: Deliverable, actor?: string): void;
declare function linkArtifactToDeliverable(ydoc: Y.Doc, deliverableId: string, artifactId: string, actor?: string): boolean;
declare function getPlanOwnerId(ydoc: Y.Doc): string | null;
declare function isApprovalRequired(ydoc: Y.Doc): boolean;
declare function getApprovedUsers(ydoc: Y.Doc): string[];
declare function isUserApproved(ydoc: Y.Doc, userId: string): boolean;
declare function approveUser(ydoc: Y.Doc, userId: string, actor?: string): void;
declare function revokeUser(ydoc: Y.Doc, userId: string, actor?: string): boolean;
declare function getRejectedUsers(ydoc: Y.Doc): string[];
declare function isUserRejected(ydoc: Y.Doc, userId: string): boolean;
declare function rejectUser(ydoc: Y.Doc, userId: string, actor?: string): void;
declare function unrejectUser(ydoc: Y.Doc, userId: string, actor?: string): boolean;
declare function getLinkedPRs(ydoc: Y.Doc): LinkedPR[];
declare function linkPR(ydoc: Y.Doc, pr: LinkedPR, actor?: string): void;
declare function unlinkPR(ydoc: Y.Doc, prNumber: number): boolean;
declare function getLinkedPR(ydoc: Y.Doc, prNumber: number): LinkedPR | null;
declare function updateLinkedPRStatus(ydoc: Y.Doc, prNumber: number, status: LinkedPR['status']): boolean;
declare function getPRReviewComments(ydoc: Y.Doc): PRReviewComment[];
declare function getPRReviewCommentsForPR(ydoc: Y.Doc, prNumber: number): PRReviewComment[];
declare function addPRReviewComment(ydoc: Y.Doc, comment: PRReviewComment, actor?: string): void;
declare function resolvePRReviewComment(ydoc: Y.Doc, commentId: string, resolved: boolean): boolean;
declare function removePRReviewComment(ydoc: Y.Doc, commentId: string): boolean;
declare function markPlanAsViewed(ydoc: Y.Doc, username: string): void;
declare function getViewedBy(ydoc: Y.Doc): Record<string, number>;
declare function isPlanUnread(metadata: Pick<PlanMetadata, 'updatedAt'>, username: string, viewedBy?: Record<string, number>): boolean;
declare function getConversationVersions(ydoc: Y.Doc): ConversationVersion[];
declare function addConversationVersion(ydoc: Y.Doc, version: ConversationVersion, actor?: string): void;
declare function markVersionHandedOff(ydoc: Y.Doc, versionId: string, handedOffTo: string, actor?: string): void;
/**
 * Type-safe helper to extract data type for a specific event type.
 * Used to ensure correct data payload for each event type.
 * Handles both required and optional data fields.
 */
type EventDataForType<T extends PlanEventType> = Extract<PlanEvent, {
  type: T;
}> extends infer E ? E extends {
  data: infer D;
} ? D : E extends {
  data?: infer D;
} ? D | undefined : undefined : never;
/**
 * Log a plan event with type-safe data payload.
 * TypeScript will enforce that the data parameter matches the event type.
 * @returns The ID of the created event (either provided or generated)
 */
declare function logPlanEvent<T extends PlanEventType>(ydoc: Y.Doc, type: T, actor: string, ...args: EventDataForType<T> extends undefined ? [data?: undefined, options?: {
  id?: string;
  inboxWorthy?: boolean;
  inboxFor?: string | string[];
}] : [data: EventDataForType<T>, options?: {
  id?: string;
  inboxWorthy?: boolean;
  inboxFor?: string | string[];
}]): string;
declare function getPlanEvents(ydoc: Y.Doc): PlanEvent[];
/**
 * Get all snapshots from the Y.Doc.
 * Returns snapshots sorted by createdAt (oldest first).
 */
declare function getSnapshots(ydoc: Y.Doc): PlanSnapshot[];
/**
 * Add a snapshot to the Y.Doc.
 * Snapshots are append-only for CRDT correctness.
 */
declare function addSnapshot(ydoc: Y.Doc, snapshot: PlanSnapshot, actor?: string): void;
/**
 * Create a snapshot of the current plan state.
 * Captures content, thread summary, artifacts, and deliverables.
 *
 * @param ydoc - The Y.Doc containing the plan
 * @param reason - Why this snapshot was created (e.g., "Approved by reviewer")
 * @param actor - Who triggered the snapshot (agent or human name)
 * @param status - The plan status at time of snapshot
 * @param blocks - The content blocks (BlockNote Block[])
 * @returns The created snapshot (not yet added to Y.Doc - call addSnapshot separately)
 */
declare function createPlanSnapshot(ydoc: Y.Doc, reason: string, actor: string, status: PlanStatusType, blocks: unknown[]): PlanSnapshot;
/**
 * Get the latest snapshot from the Y.Doc.
 * Returns null if no snapshots exist.
 */
declare function getLatestSnapshot(ydoc: Y.Doc): PlanSnapshot | null;
/**
 * Add a tag to a plan (automatically normalizes and deduplicates).
 * Tags are normalized to lowercase and trimmed to prevent duplicates.
 */
declare function addPlanTag(ydoc: Y.Doc, tag: string, actor?: string): void;
/**
 * Remove a tag from a plan.
 */
declare function removePlanTag(ydoc: Y.Doc, tag: string, actor?: string): void;
/**
 * Get all unique tags from a list of plan index entries (for autocomplete).
 * Returns sorted array of unique tags.
 */
declare function getAllTagsFromIndex(indexEntries: Array<{
  tags?: string[];
}>): string[];
/**
 * Result type for archive operations.
 */
type ArchiveResult = {
  success: true;
} | {
  success: false;
  error: string;
};
/**
 * Archive a plan - marks it as archived with timestamp and actor.
 * Validates that the plan exists and is not already archived.
 */
declare function archivePlan(ydoc: Y.Doc, actorId: string): ArchiveResult;
/**
 * Unarchive a plan - removes archived status.
 * Validates that the plan exists and is currently archived.
 */
declare function unarchivePlan(ydoc: Y.Doc, actorId: string): ArchiveResult;
/**
 * Answer a pending input request with validation.
 * Used by browser UI when user responds to input request modal.
 */
declare function answerInputRequest(ydoc: Y.Doc, requestId: string, response: string, answeredBy: string): {
  success: boolean;
  error?: string;
};
/**
 * Cancel a pending input request.
 * Used when user closes modal without responding.
 */
declare function cancelInputRequest(ydoc: Y.Doc, requestId: string): {
  success: boolean;
  error?: string;
};
//#endregion
export { markPlanAsViewed as $, getDeliverables as A, RegisterServerRequestSchema as At, getRejectedUsers as B, UnregisterServerResponseSchema as Bt, createPlanSnapshot as C, CreateSubscriptionResponse as Ct, getApprovedUsers as D, HookApiError as Dt, getAllTagsFromIndex as E, GetReviewStatusResponseSchema as Et, getPRReviewCommentsForPR as F, ReviewFeedback as Ft, isApprovalRequired as G, UpdatePresenceRequest as Gt, getStepCompletions as H, UpdatePlanContentRequestSchema as Ht, getPlanEvents as I, ReviewFeedbackSchema as It, isUserApproved as J, UpdatePresenceResponseSchema as Jt, isPlanUnread as K, UpdatePresenceRequestSchema as Kt, getPlanMetadata as L, UnregisterServerRequest as Lt, getLinkedPR as M, RegisterServerResponseSchema as Mt, getLinkedPRs as N, ReviewComment as Nt, getArtifacts as O, HookApiErrorSchema as Ot, getPRReviewComments as P, ReviewCommentSchema as Pt, logPlanEvent as Q, getPlanMetadataWithValidation as R, UnregisterServerRequestSchema as Rt, clearAgentPresence as S, CreateSubscriptionRequestSchema as St, getAgentPresences as T, GetReviewStatusResponse as Tt, getViewedBy as U, UpdatePlanContentResponse as Ut, getSnapshots as V, UpdatePlanContentRequest as Vt, initPlanMetadata as W, UpdatePlanContentResponseSchema as Wt, linkArtifactToDeliverable as X, isUserRejected as Y, linkPR as Z, addSnapshot as _, CreateHookSessionRequest as _t, StatusTransition as a, resolvePRReviewComment as at, archivePlan as b, CreateHookSessionResponseSchema as bt, TransitionToCompleted as c, setPlanMetadata as ct, VALID_STATUS_TRANSITIONS as d, unarchivePlan as dt, markVersionHandedOff as et, addArtifact as f, unlinkPR as ft, addPlanTag as g, AgentPresenceSchema as gt, addPRReviewComment as h, AgentPresence as ht, PlanMetadataBaseUpdate as i, removePlanTag as it, getLatestSnapshot as j, RegisterServerResponse as jt, getConversationVersions as k, RegisterServerRequest as kt, TransitionToInProgress as l, toggleStepCompletion as lt, addDeliverable as m, updateLinkedPRStatus as mt, GetPlanMetadataResult as n, removeArtifact as nt, TransitionResult as o, revokeUser as ot, addConversationVersion as p, unrejectUser as pt, isStepCompleted as q, UpdatePresenceResponse as qt, InitPlanMetadataParams as r, removePRReviewComment as rt, TransitionToChangesRequested as s, setAgentPresence as st, ArchiveResult as t, rejectUser as tt, TransitionToPendingReview as u, transitionPlanStatus as ut, answerInputRequest as v, CreateHookSessionRequestSchema as vt, getAgentPresence as w, CreateSubscriptionResponseSchema as wt, cancelInputRequest as x, CreateSubscriptionRequest as xt, approveUser as y, CreateHookSessionResponse as yt, getPlanOwnerId as z, UnregisterServerResponse as zt };
//# sourceMappingURL=yjs-helpers-CZnJfYVg.d.mts.map