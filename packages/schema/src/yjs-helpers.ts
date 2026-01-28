import { nanoid } from 'nanoid';
import * as Y from 'yjs';
import { assertNever } from './assert-never.js';
import { type AgentPresence, AgentPresenceSchema } from './hook-api.js';

/**
 * Re-export change snapshot helpers from dedicated module.
 * These functions were extracted for better file organization.
 */
export {
  getChangeSnapshot,
  getChangeSnapshots,
  markMachineDisconnected,
  removeChangeSnapshot,
  setChangeSnapshot,
} from './change-snapshot-helpers.js';

import {
  type AnyInputRequest,
  AnyInputRequestSchema,
  InputRequestSchema,
  type MultiQuestionInputRequest,
  MultiQuestionInputRequestSchema,
} from './input-request.js';
import {
  type Artifact,
  ArtifactSchema,
  type ConversationVersion,
  ConversationVersionSchema,
  type Deliverable,
  DeliverableSchema,
  type LinkedPR,
  LinkedPRSchema,
  type LocalDiffComment,
  LocalDiffCommentSchema,
  type OriginMetadata,
  type PlanEvent,
  PlanEventSchema,
  type PlanEventType,
  type PlanMetadata,
  PlanMetadataSchema,
  type PlanSnapshot,
  PlanSnapshotSchema,
  type PlanStatusType,
  type PRReviewComment,
  PRReviewCommentSchema,
} from './plan.js';
import { parseThreads, type Thread, ThreadSchema } from './thread.js';
import { YDOC_KEYS } from './yjs-keys.js';

/**
 * Safely converts Y.Array.toJSON() to unknown[] for validation.
 *
 * Yjs's toJSON() returns `any`, which bypasses type checking.
 * This wrapper converts `any` to `unknown`, forcing callers to validate
 * before use (typically with Zod schemas).
 *
 * @param array - Yjs array to convert
 * @returns Array of unknown items that must be validated before use
 */
function toUnknownArray<T = unknown>(array: Y.Array<T>): unknown[] {
  return array.toJSON();
}

/**
 * Type guard to check if a value has a toJSON method (like Y.Map, Y.Array, etc).
 * Used to safely convert Yjs types to plain objects without unsafe type assertions.
 *
 * This replaces the pattern:
 *   typeof (value as { toJSON?: () => unknown }).toJSON === 'function'
 *
 * With the type-safe pattern:
 *   if (hasToJSON(value)) { value.toJSON(); }
 *
 * @param value - The value to check
 * @returns True if the value has a toJSON method
 */
export function hasToJSON(value: unknown): value is { toJSON: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toJSON' in value &&
    typeof value.toJSON === 'function'
  );
}

/**
 * Type guard to check if a value is a plain object (not array, not null).
 * Used to safely narrow unknown to Record<string, unknown>.
 *
 * @param value - The value to check
 * @returns True if the value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely convert a value to a plain object.
 * Handles both Y.Map (which has toJSON) and plain objects.
 *
 * This is the recommended way to extract data from Y.Doc map entries
 * where the value could be either a Y.Map or a plain object depending
 * on CRDT sync state.
 *
 * @param value - The value to convert (Y.Map or plain object)
 * @returns Plain object representation of the value
 */
export function toPlainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  if (hasToJSON(value)) {
    const json = value.toJSON();
    if (isPlainObject(json)) {
      return json;
    }
    return null;
  }

  if (isPlainObject(value)) {
    return value;
  }

  return null;
}

/**
 * Find an input request by ID in the raw CRDT data.
 *
 * This function is needed because:
 * 1. We need the ACTUAL index in the Y.Array for delete/insert operations
 * 2. Schema validation might filter out requests with legacy/invalid data
 * 3. We want to find the request first, then validate it specifically
 *
 * @param data - Raw array data from Y.Array.toJSON()
 * @param requestId - The ID of the request to find
 * @returns Object with rawIndex and validated request, or null if not found
 */
function findInputRequestById(
  data: unknown[],
  requestId: string
): { rawIndex: number; request: AnyInputRequest } | null {
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item && typeof item === 'object' && 'id' in item && item.id === requestId) {
      const parsed = AnyInputRequestSchema.safeParse(item);
      if (parsed.success) {
        return { rawIndex: i, request: parsed.data };
      }
      return null;
    }
  }
  return null;
}

/**
 * Fields that can be safely updated without changing status.
 * These are the common base fields that don't have invariants with status.
 */
export interface PlanMetadataBaseUpdate {
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
 * All transitions are now allowed to support flexible Kanban workflows.
 * Required fields are auto-generated during transitions to prevent CRDT corruption.
 *
 * Each transition requires specific fields to be provided.
 */
export const VALID_STATUS_TRANSITIONS: Record<PlanStatusType, PlanStatusType[]> = {
  draft: ['pending_review', 'in_progress', 'changes_requested', 'completed'],
  pending_review: ['draft', 'in_progress', 'changes_requested', 'completed'],
  changes_requested: ['draft', 'pending_review', 'in_progress', 'completed'],
  in_progress: ['draft', 'pending_review', 'changes_requested', 'completed'],
  completed: ['draft', 'pending_review', 'in_progress', 'changes_requested'],
};

/**
 * Type for transitioning to draft status.
 * Clears all status-specific fields.
 */
export interface TransitionToDraft {
  status: 'draft';
}

/**
 * Type for transitioning to pending_review status.
 */
export interface TransitionToPendingReview {
  status: 'pending_review';
  reviewRequestId: string;
}

/**
 * Type for transitioning to changes_requested status.
 */
export interface TransitionToChangesRequested {
  status: 'changes_requested';
  reviewedAt: number;
  reviewedBy: string;
  reviewComment?: string;
}

/**
 * Type for transitioning to in_progress status.
 * Requires reviewedAt and reviewedBy to satisfy PlanMetadata schema invariants.
 * Without these fields, the discriminated union validation will fail.
 */
export interface TransitionToInProgress {
  status: 'in_progress';
  reviewedAt: number;
  reviewedBy: string;
  reviewComment?: string;
}

/**
 * Type for transitioning to completed status.
 */
export interface TransitionToCompleted {
  status: 'completed';
  completedAt: number;
  completedBy: string;
  snapshotUrl?: string;
}

/**
 * Union of all valid status transitions.
 */
export type StatusTransition =
  | TransitionToDraft
  | TransitionToPendingReview
  | TransitionToChangesRequested
  | TransitionToInProgress
  | TransitionToCompleted;

/**
 * Result type for status transition operations.
 */
export type TransitionResult = { success: true } | { success: false; error: string };

/**
 * Result type for getPlanMetadata with validation errors.
 */
export type GetPlanMetadataResult =
  | { success: true; data: PlanMetadata }
  | { success: false; error: string };

/**
 * Get plan metadata from Y.Doc with validation.
 * @returns PlanMetadata if valid, null if data is missing or invalid.
 * @deprecated Use getPlanMetadataWithValidation for error details.
 */
export function getPlanMetadata(ydoc: Y.Doc): PlanMetadata | null {
  const result = getPlanMetadataWithValidation(ydoc);
  return result.success ? result.data : null;
}

/**
 * Get plan metadata from Y.Doc with detailed validation errors.
 * Surfaces corruption errors instead of silently swallowing them.
 */
export function getPlanMetadataWithValidation(ydoc: Y.Doc): GetPlanMetadataResult {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const data = map.toJSON();

  if (!data || Object.keys(data).length === 0) {
    return { success: false, error: 'No metadata found in Y.Doc' };
  }

  const result = PlanMetadataSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: `Invalid metadata: ${result.error.message}` };
  }

  return { success: true, data: result.data };
}

/**
 * Update plan metadata base fields (non-status fields).
 * Use transitionPlanStatus() for status changes.
 *
 * This function only allows updating fields that don't have status invariants.
 * Status changes must go through transitionPlanStatus() to ensure valid transitions.
 */
export function setPlanMetadata(
  ydoc: Y.Doc,
  metadata: PlanMetadataBaseUpdate,
  actor?: string
): void {
  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);

      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined) {
          map.set(key, value);
        }
      }

      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );
}

/**
 * Apply draft transition fields to metadata map.
 * Clears all status-specific fields to ensure clean state.
 */
function applyDraftTransition(map: Y.Map<unknown>, _transition: TransitionToDraft): void {
  map.delete('reviewRequestId');
  map.delete('reviewedAt');
  map.delete('reviewedBy');
  map.delete('reviewComment');
  map.delete('completedAt');
  map.delete('completedBy');
  map.delete('snapshotUrl');
}

/**
 * Apply pending_review transition fields to metadata map.
 */
function applyPendingReviewTransition(
  map: Y.Map<unknown>,
  transition: TransitionToPendingReview
): void {
  map.set('reviewRequestId', transition.reviewRequestId);
}

/**
 * Apply changes_requested transition fields to metadata map.
 */
function applyChangesRequestedTransition(
  map: Y.Map<unknown>,
  transition: TransitionToChangesRequested
): void {
  map.set('reviewedAt', transition.reviewedAt);
  map.set('reviewedBy', transition.reviewedBy);
  if (transition.reviewComment !== undefined) {
    map.set('reviewComment', transition.reviewComment);
  }
}

/**
 * Apply in_progress transition fields to metadata map.
 * Always sets reviewedAt and reviewedBy to satisfy schema invariants.
 */
function applyInProgressTransition(map: Y.Map<unknown>, transition: TransitionToInProgress): void {
  map.set('reviewedAt', transition.reviewedAt);
  map.set('reviewedBy', transition.reviewedBy);
  if (transition.reviewComment !== undefined) {
    map.set('reviewComment', transition.reviewComment);
  }
}

/**
 * Apply completed transition fields to metadata map.
 */
function applyCompletedTransition(map: Y.Map<unknown>, transition: TransitionToCompleted): void {
  map.set('completedAt', transition.completedAt);
  map.set('completedBy', transition.completedBy);
  if (transition.snapshotUrl !== undefined) {
    map.set('snapshotUrl', transition.snapshotUrl);
  }
}

/**
 * Apply status-specific transition fields to metadata map.
 */
function applyStatusTransitionFields(map: Y.Map<unknown>, transition: StatusTransition): void {
  switch (transition.status) {
    case 'draft':
      applyDraftTransition(map, transition);
      break;
    case 'pending_review':
      applyPendingReviewTransition(map, transition);
      break;
    case 'changes_requested':
      applyChangesRequestedTransition(map, transition);
      break;
    case 'in_progress':
      applyInProgressTransition(map, transition);
      break;
    case 'completed':
      applyCompletedTransition(map, transition);
      break;
    default:
      assertNever(transition);
  }
}

/**
 * Reset a plan back to draft status.
 * This is a special operation that bypasses the normal state machine because
 * there's no forward transition TO draft - it's only reachable via reset.
 *
 * Clears status-specific fields to ensure valid discriminated union state:
 * - reviewRequestId (from pending_review)
 * - reviewedAt, reviewedBy, reviewComment (from changes_requested/in_progress)
 * - completedAt, completedBy, snapshotUrl (from completed)
 *
 * @param ydoc - The Y.Doc containing the plan
 * @param actor - Optional actor name for transaction metadata
 * @returns TransitionResult indicating success or failure
 */
export function resetPlanToDraft(ydoc: Y.Doc, actor?: string): TransitionResult {
  const metadataResult = getPlanMetadataWithValidation(ydoc);
  if (!metadataResult.success) {
    return { success: false, error: metadataResult.error };
  }

  const currentStatus = metadataResult.data.status;
  if (currentStatus === 'draft') {
    return { success: false, error: 'Plan is already in draft status' };
  }

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);

      map.set('status', 'draft');
      map.delete('reviewRequestId');
      map.delete('reviewedAt');
      map.delete('reviewedBy');
      map.delete('reviewComment');
      map.delete('completedAt');
      map.delete('completedBy');
      map.delete('snapshotUrl');
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );

  return { success: true };
}

/**
 * Transition plan status with state machine validation.
 * Enforces valid status transitions and ensures required fields are provided.
 *
 * Valid transitions:
 * - draft -> pending_review (requires reviewRequestId)
 * - draft -> in_progress (requires reviewedAt, reviewedBy for schema validity)
 * - pending_review -> in_progress (requires reviewedAt, reviewedBy)
 * - pending_review -> changes_requested (requires reviewedAt, reviewedBy, optional reviewComment)
 * - changes_requested -> pending_review (requires reviewRequestId)
 * - changes_requested -> in_progress (requires reviewedAt, reviewedBy)
 * - in_progress -> completed (requires completedAt, completedBy, optional snapshotUrl)
 *
 * Note: To reset to draft, use resetPlanToDraft() instead.
 */
export function transitionPlanStatus(
  ydoc: Y.Doc,
  transition: StatusTransition,
  actor?: string
): TransitionResult {
  const metadataResult = getPlanMetadataWithValidation(ydoc);
  if (!metadataResult.success) {
    return { success: false, error: metadataResult.error };
  }

  const currentStatus = metadataResult.data.status;
  const validTargets = VALID_STATUS_TRANSITIONS[currentStatus];

  if (!validTargets.includes(transition.status)) {
    return {
      success: false,
      error: `Invalid transition: cannot go from '${currentStatus}' to '${transition.status}'. Valid targets: ${validTargets.join(', ') || 'none (terminal state)'}`,
    };
  }

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      map.set('status', transition.status);
      applyStatusTransitionFields(map, transition);
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );

  return { success: true };
}

/**
 * Initialize plan metadata for a new draft plan.
 * Only creates plans in 'draft' status - use transitionPlanStatus() to change status.
 *
 * Note: This function is intentionally restricted to draft status.
 * Other statuses require specific fields (reviewRequestId for pending_review, etc.)
 * that should be set via transitionPlanStatus() for proper validation.
 */
export interface InitPlanMetadataParams {
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

export function initPlanMetadata(ydoc: Y.Doc, init: InitPlanMetadataParams): void {
  /**
   * CRITICAL: Wrap all map.set() operations in a transaction.
   * Without this, CRDT observers fire after EACH set() with incomplete data,
   * causing validation errors like "No matching discriminator" when status
   * field hasn't been set yet.
   */
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    const now = Date.now();

    map.set('id', init.id);
    map.set('title', init.title);
    map.set('status', 'draft');
    map.set('createdAt', now);
    map.set('updatedAt', now);

    if (init.repo) map.set('repo', init.repo);
    if (init.pr) map.set('pr', init.pr);

    if (init.ownerId) {
      map.set('ownerId', init.ownerId);
      map.set('approvedUsers', [init.ownerId]);
      map.set('approvalRequired', init.approvalRequired ?? true);
    }

    if (init.sessionTokenHash) {
      map.set('sessionTokenHash', init.sessionTokenHash);
    }

    if (init.origin) {
      map.set('origin', init.origin);
    }

    if (init.tags) {
      map.set('tags', init.tags);
    }
  });

  /**
   * Validate AFTER transaction completes, not inside.
   * If validation throws inside transaction, the writes are already applied
   * (Yjs transactions don't rollback on throw). By validating outside,
   * we maintain the same pattern as addArtifact() and other functions.
   */
  const result = getPlanMetadataWithValidation(ydoc);
  if (!result.success) {
    throw new Error(`Failed to initialize metadata: ${result.error}`);
  }
}

export function getStepCompletions(ydoc: Y.Doc): Map<string, boolean> {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  return new Map(steps.entries());
}

export function toggleStepCompletion(ydoc: Y.Doc, stepId: string, actor?: string): void {
  ydoc.transact(
    () => {
      const steps = ydoc.getMap<boolean>('stepCompletions');
      const current = steps.get(stepId) || false;
      steps.set(stepId, !current);
    },
    actor ? { actor } : undefined
  );
}

export function isStepCompleted(ydoc: Y.Doc, stepId: string): boolean {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  return steps.get(stepId) || false;
}

export function getArtifacts(ydoc: Y.Doc): Artifact[] {
  const array = ydoc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS);
  const data = toUnknownArray(array);

  return data
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const artifact = Object.fromEntries(Object.entries(item));
      if (artifact.url && !artifact.storage) {
        return { ...artifact, storage: 'github' };
      }
      if (!artifact.storage && !artifact.url && !artifact.localArtifactId) {
        return null;
      }
      return artifact;
    })
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ArtifactSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function addArtifact(ydoc: Y.Doc, artifact: Artifact, actor?: string): void {
  /*
   * CRITICAL: Validate BEFORE transaction to prevent partial writes on validation failure.
   * Validates discriminated union (storage: 'github' | 'local').
   *
   * Why validation-first pattern matters:
   * - If validation throws inside transaction, Y.Doc may contain partial/corrupted state
   * - Pre-validation ensures atomic all-or-nothing behavior
   * - Failed validation returns clear error without touching Y.Doc
   */
  const validated = ArtifactSchema.parse(artifact);

  ydoc.transact(
    () => {
      const array = ydoc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS);
      array.push([validated]);
    },
    actor ? { actor } : undefined
  );
}

export function removeArtifact(ydoc: Y.Doc, artifactId: string): boolean {
  const array = ydoc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS);
  const data = toUnknownArray(array);
  const artifacts = data
    .map((item) => ArtifactSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);

  const index = artifacts.findIndex((a) => a.id === artifactId);

  if (index === -1) return false;

  array.delete(index, 1);
  return true;
}

/**
 * Get all agent presence records from Y.Doc CRDT.
 *
 * IMPORTANT: This is for AUDIT TRAIL / HISTORICAL TRACKING only.
 * NOT used for real-time presence display.
 *
 * Real-time presence uses WebRTC awareness protocol instead:
 * @see apps/web/src/hooks/useP2PPeers.ts - For real-time connected peer tracking
 *
 * CRDT presence is:
 * - Written by: Server via setAgentPresence()
 * - Read by: Audit/historical analysis (no current consumers)
 * - Browser: Does NOT read this - only uses WebRTC awareness for real-time updates
 *
 * @param ydoc - The Y.Doc containing presence data
 * @returns Map of sessionId → AgentPresence records (may be stale/historical)
 */
export function getAgentPresences(ydoc: Y.Doc): Map<string, AgentPresence> {
  const map = ydoc.getMap<AgentPresence>(YDOC_KEYS.PRESENCE);
  const result = new Map<string, AgentPresence>();

  for (const [sessionId, value] of map.entries()) {
    const parsed = AgentPresenceSchema.safeParse(value);
    if (parsed.success) {
      result.set(sessionId, parsed.data);
    }
  }

  return result;
}

/**
 * Write agent presence to Y.Doc CRDT.
 *
 * IMPORTANT: This is for AUDIT TRAIL / HISTORICAL TRACKING only.
 * NOT used for real-time presence display.
 *
 * Real-time presence uses WebRTC awareness protocol instead:
 * @see apps/web/src/hooks/useP2PPeers.ts - For real-time connected peer tracking
 *
 * CRDT presence is:
 * - Written by: Server via apps/server/src/registry-server.ts hook API
 * - Read by: Audit/historical analysis (no current consumers)
 * - Browser: Does NOT read this - only uses WebRTC awareness for real-time updates
 *
 * Use case: Future audit trail / historical replay of agent connections
 *
 * @param ydoc - The Y.Doc to write to
 * @param presence - AgentPresence record to store
 * @param actor - Optional actor name for transaction metadata
 */
export function setAgentPresence(ydoc: Y.Doc, presence: AgentPresence, actor?: string): void {
  const validated = AgentPresenceSchema.parse(presence);

  ydoc.transact(
    () => {
      const map = ydoc.getMap<AgentPresence>(YDOC_KEYS.PRESENCE);
      map.set(validated.sessionId, validated);
    },
    actor ? { actor } : undefined
  );
}

export function clearAgentPresence(ydoc: Y.Doc, sessionId: string): boolean {
  const map = ydoc.getMap<AgentPresence>(YDOC_KEYS.PRESENCE);
  if (!map.has(sessionId)) return false;
  map.delete(sessionId);
  return true;
}

/**
 * Get a single agent presence record from Y.Doc CRDT.
 *
 * IMPORTANT: This is for AUDIT TRAIL / HISTORICAL TRACKING only.
 * NOT used for real-time presence display.
 *
 * Real-time presence uses WebRTC awareness protocol instead:
 * @see apps/web/src/hooks/useP2PPeers.ts - For real-time connected peer tracking
 *
 * CRDT presence is:
 * - Written by: Server via setAgentPresence()
 * - Read by: Audit/historical analysis (no current consumers)
 * - Browser: Does NOT read this - only uses WebRTC awareness for real-time updates
 *
 * @param ydoc - The Y.Doc to read from
 * @param sessionId - The session ID to look up
 * @returns AgentPresence record if found (may be stale/historical), null otherwise
 */
export function getAgentPresence(ydoc: Y.Doc, sessionId: string): AgentPresence | null {
  const map = ydoc.getMap<AgentPresence>(YDOC_KEYS.PRESENCE);
  const value = map.get(sessionId);
  if (!value) return null;

  const parsed = AgentPresenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getDeliverables(ydoc: Y.Doc): Deliverable[] {
  const array = ydoc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
  const data = toUnknownArray(array);

  return data
    .map((item) => DeliverableSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function addDeliverable(ydoc: Y.Doc, deliverable: Deliverable, actor?: string): void {
  const validated = DeliverableSchema.parse(deliverable);

  ydoc.transact(
    () => {
      const array = ydoc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
      array.push([validated]);
    },
    actor ? { actor } : undefined
  );
}

export function linkArtifactToDeliverable(
  ydoc: Y.Doc,
  deliverableId: string,
  artifactId: string,
  actor?: string
): boolean {
  const array = ydoc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
  const data = toUnknownArray(array);
  const deliverables = data
    .map((item) => DeliverableSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = deliverables.findIndex((d) => d.id === deliverableId);

  if (index === -1) return false;

  const existing = deliverables[index];
  if (!existing) return false;

  const updated: Deliverable = {
    id: existing.id,
    text: existing.text,
    linkedArtifactId: artifactId,
    linkedAt: Date.now(),
  };

  ydoc.transact(
    () => {
      array.delete(index, 1);
      array.insert(index, [updated]);
    },
    actor ? { actor } : undefined
  );

  return true;
}

export function getPlanOwnerId(ydoc: Y.Doc): string | null {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const ownerId = map.get('ownerId');
  return typeof ownerId === 'string' ? ownerId : null;
}

export function isApprovalRequired(ydoc: Y.Doc): boolean {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const approvalRequired = map.get('approvalRequired');
  if (typeof approvalRequired === 'boolean') {
    return approvalRequired;
  }
  const ownerId = map.get('ownerId');
  return typeof ownerId === 'string' && ownerId.length > 0;
}

export function getApprovedUsers(ydoc: Y.Doc): string[] {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const approvedUsers = map.get('approvedUsers');
  if (!Array.isArray(approvedUsers)) {
    return [];
  }
  return approvedUsers.filter((id): id is string => typeof id === 'string');
}

export function isUserApproved(ydoc: Y.Doc, userId: string): boolean {
  const ownerId = getPlanOwnerId(ydoc);
  if (ownerId === userId) {
    return true;
  }
  return getApprovedUsers(ydoc).includes(userId);
}

export function approveUser(ydoc: Y.Doc, userId: string, actor?: string): void {
  const currentApproved = getApprovedUsers(ydoc);
  if (currentApproved.includes(userId)) {
    return;
  }

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      map.set('approvedUsers', [...currentApproved, userId]);
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );
}

export function revokeUser(ydoc: Y.Doc, userId: string, actor?: string): boolean {
  const ownerId = getPlanOwnerId(ydoc);

  if (userId === ownerId) {
    return false;
  }

  const currentApproved = getApprovedUsers(ydoc);
  const index = currentApproved.indexOf(userId);
  if (index === -1) {
    return false;
  }

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      map.set(
        'approvedUsers',
        currentApproved.filter((id) => id !== userId)
      );
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );

  return true;
}

export function getRejectedUsers(ydoc: Y.Doc): string[] {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const rejectedUsers = map.get('rejectedUsers');
  if (!Array.isArray(rejectedUsers)) {
    return [];
  }
  return rejectedUsers.filter((id): id is string => typeof id === 'string');
}

export function isUserRejected(ydoc: Y.Doc, userId: string): boolean {
  return getRejectedUsers(ydoc).includes(userId);
}

export function rejectUser(ydoc: Y.Doc, userId: string, actor?: string): void {
  const ownerId = getPlanOwnerId(ydoc);

  if (userId === ownerId) {
    return;
  }

  const currentRejected = getRejectedUsers(ydoc);
  const currentApproved = getApprovedUsers(ydoc);

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);

      if (!currentRejected.includes(userId)) {
        map.set('rejectedUsers', [...currentRejected, userId]);
      }

      if (currentApproved.includes(userId)) {
        map.set(
          'approvedUsers',
          currentApproved.filter((id) => id !== userId)
        );
      }

      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );
}

export function unrejectUser(ydoc: Y.Doc, userId: string, actor?: string): boolean {
  const currentRejected = getRejectedUsers(ydoc);
  const index = currentRejected.indexOf(userId);
  if (index === -1) {
    return false;
  }

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      map.set(
        'rejectedUsers',
        currentRejected.filter((id) => id !== userId)
      );
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );

  return true;
}

export function getLinkedPRs(ydoc: Y.Doc): LinkedPR[] {
  const array = ydoc.getArray<LinkedPR>(YDOC_KEYS.LINKED_PRS);
  const data = toUnknownArray(array);

  return data
    .map((item) => LinkedPRSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function linkPR(ydoc: Y.Doc, pr: LinkedPR, actor?: string): void {
  const validated = LinkedPRSchema.parse(pr);

  ydoc.transact(
    () => {
      const array = ydoc.getArray<LinkedPR>(YDOC_KEYS.LINKED_PRS);
      const data = toUnknownArray(array);
      const existing = data
        .map((item) => LinkedPRSchema.safeParse(item))
        .filter((r) => r.success)
        .map((r) => r.data);
      const index = existing.findIndex((p) => p.prNumber === validated.prNumber);

      if (index !== -1) {
        array.delete(index, 1);
      }

      array.push([validated]);
    },
    actor ? { actor } : undefined
  );
}

export function unlinkPR(ydoc: Y.Doc, prNumber: number): boolean {
  const array = ydoc.getArray<LinkedPR>(YDOC_KEYS.LINKED_PRS);
  const data = toUnknownArray(array);
  const existing = data
    .map((item) => LinkedPRSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = existing.findIndex((p) => p.prNumber === prNumber);

  if (index === -1) return false;

  array.delete(index, 1);

  return true;
}

export function getLinkedPR(ydoc: Y.Doc, prNumber: number): LinkedPR | null {
  const prs = getLinkedPRs(ydoc);
  return prs.find((pr) => pr.prNumber === prNumber) ?? null;
}

export function updateLinkedPRStatus(
  ydoc: Y.Doc,
  prNumber: number,
  status: LinkedPR['status']
): boolean {
  const array = ydoc.getArray<LinkedPR>(YDOC_KEYS.LINKED_PRS);
  const data = toUnknownArray(array);
  const existing = data
    .map((item) => LinkedPRSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = existing.findIndex((p) => p.prNumber === prNumber);

  if (index === -1) return false;

  const pr = existing[index];
  if (!pr) return false;

  /**
   * Wrap delete + insert in a transaction to prevent observers from
   * firing with intermediate state (item deleted but not yet reinserted).
   */
  ydoc.transact(() => {
    array.delete(index, 1);
    array.insert(index, [{ ...pr, status }]);
  });

  return true;
}

export function getPRReviewComments(ydoc: Y.Doc): PRReviewComment[] {
  const array = ydoc.getArray<PRReviewComment>(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const data = toUnknownArray(array);

  return data
    .map((item) => PRReviewCommentSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

export function getPRReviewCommentsForPR(ydoc: Y.Doc, prNumber: number): PRReviewComment[] {
  return getPRReviewComments(ydoc).filter((c) => c.prNumber === prNumber);
}

export function addPRReviewComment(ydoc: Y.Doc, comment: PRReviewComment, actor?: string): void {
  const validated = PRReviewCommentSchema.parse(comment);

  ydoc.transact(
    () => {
      const array = ydoc.getArray<PRReviewComment>(YDOC_KEYS.PR_REVIEW_COMMENTS);
      array.push([validated]);
    },
    actor ? { actor } : undefined
  );
}

export function resolvePRReviewComment(ydoc: Y.Doc, commentId: string, resolved: boolean): boolean {
  const array = ydoc.getArray<PRReviewComment>(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const data = toUnknownArray(array);
  const existing = data
    .map((item) => PRReviewCommentSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = existing.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  const comment = existing[index];
  if (!comment) return false;

  /**
   * Wrap delete + insert in a transaction to prevent observers from
   * firing with intermediate state (item deleted but not yet reinserted).
   */
  ydoc.transact(() => {
    array.delete(index, 1);
    array.insert(index, [{ ...comment, resolved }]);
  });

  return true;
}

export function removePRReviewComment(ydoc: Y.Doc, commentId: string): boolean {
  const array = ydoc.getArray<PRReviewComment>(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const data = toUnknownArray(array);
  const existing = data
    .map((item) => PRReviewCommentSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = existing.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  array.delete(index, 1);
  return true;
}

/**
 * Get all local diff comments from the Y.Doc.
 * Local diff comments are review comments on uncommitted changes.
 */
export function getLocalDiffComments(ydoc: Y.Doc): LocalDiffComment[] {
  const array = ydoc.getArray<LocalDiffComment>(YDOC_KEYS.LOCAL_DIFF_COMMENTS);
  const data = toUnknownArray(array);

  return data
    .map((item) => LocalDiffCommentSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

/**
 * Get local diff comments for a specific file path.
 */
export function getLocalDiffCommentsForFile(ydoc: Y.Doc, path: string): LocalDiffComment[] {
  return getLocalDiffComments(ydoc).filter((c) => c.path === path);
}

/**
 * Add a local diff comment to the Y.Doc.
 * Validates the comment before adding to prevent partial/corrupted state.
 */
export function addLocalDiffComment(ydoc: Y.Doc, comment: LocalDiffComment, actor?: string): void {
  const validated = LocalDiffCommentSchema.parse(comment);

  ydoc.transact(
    () => {
      const array = ydoc.getArray<LocalDiffComment>(YDOC_KEYS.LOCAL_DIFF_COMMENTS);
      array.push([validated]);
    },
    actor ? { actor } : undefined
  );
}

/**
 * Resolve or unresolve a local diff comment.
 * @returns true if the comment was found and updated, false otherwise.
 */
export function resolveLocalDiffComment(
  ydoc: Y.Doc,
  commentId: string,
  resolved: boolean
): boolean {
  const array = ydoc.getArray<LocalDiffComment>(YDOC_KEYS.LOCAL_DIFF_COMMENTS);
  const data = toUnknownArray(array);
  const existing = data
    .map((item) => LocalDiffCommentSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = existing.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  const comment = existing[index];
  if (!comment) return false;

  /**
   * Wrap delete + insert in a transaction to prevent observers from
   * firing with intermediate state (item deleted but not yet reinserted).
   */
  ydoc.transact(() => {
    array.delete(index, 1);
    array.insert(index, [{ ...comment, resolved }]);
  });

  return true;
}

/**
 * Remove a local diff comment from the Y.Doc.
 * @returns true if the comment was found and removed, false otherwise.
 */
export function removeLocalDiffComment(ydoc: Y.Doc, commentId: string): boolean {
  const array = ydoc.getArray<LocalDiffComment>(YDOC_KEYS.LOCAL_DIFF_COMMENTS);
  const data = toUnknownArray(array);
  const existing = data
    .map((item) => LocalDiffCommentSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  const index = existing.findIndex((c) => c.id === commentId);

  if (index === -1) return false;

  array.delete(index, 1);
  return true;
}

/**
 * Parse a thread ID from various formats.
 * Supports:
 * - Bare UUID: "0e63dc87-28ab-4587-8c6b-029216f33ced"
 * - Wrapped format from export: "[thread:0e63dc87-28ab-4587-8c6b-029216f33ced]"
 * - Bare format with prefix: "thread:0e63dc87-28ab-4587-8c6b-029216f33ced"
 *
 * @returns The extracted thread ID (without wrapper/prefix)
 */
export function parseThreadId(threadId: string): string {
  /**
   * Match wrapped format: [thread:xxx]
   * Also handle if user passes with or without brackets
   */
  const wrappedMatch = threadId.match(/^\[?thread:([^\]]+)\]?$/);
  if (wrappedMatch?.[1]) {
    return wrappedMatch[1];
  }

  /** Return as-is if no wrapper found */
  return threadId;
}

/**
 * Result of parsing a comment ID.
 */
export interface ParsedCommentId {
  /** The comment type: 'pr', 'local', 'comment', or 'unknown' */
  type: 'pr' | 'local' | 'comment' | 'unknown';
  /** The extracted comment ID (without wrapper/prefix) */
  id: string;
}

/**
 * Parse a comment ID from various formats.
 * Supports:
 * - Bare ID: "abc123"
 * - Wrapped PR format: "[pr:abc123]" or "pr:abc123"
 * - Wrapped local format: "[local:abc123]" or "local:abc123"
 * - Wrapped comment format: "[comment:abc123]" or "comment:abc123"
 *
 * @returns Parsed comment info with type and extracted ID
 */
export function parseCommentId(commentId: string): ParsedCommentId {
  /**
   * Match wrapped format: [type:xxx] or type:xxx
   * Types: pr, local, comment
   */
  const wrappedMatch = commentId.match(/^\[?(pr|local|comment):([^\]]+)\]?$/);
  if (wrappedMatch?.[1] && wrappedMatch?.[2]) {
    return {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Regex validates type is one of pr|local|comment
      type: wrappedMatch[1] as 'pr' | 'local' | 'comment',
      id: wrappedMatch[2],
    };
  }

  /** Return as-is with unknown type if no wrapper found */
  return {
    type: 'unknown',
    id: commentId,
  };
}

/**
 * Get a specific thread by ID from the Y.Doc.
 * Supports both bare thread IDs and wrapped format from export (e.g., "[thread:abc123]").
 * @returns The thread if found, null otherwise.
 */
export function getThread(ydoc: Y.Doc, threadId: string): Thread | null {
  const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
  const threadsData = threadsMap.toJSON();

  /**
   * Parse the thread ID to extract the actual UUID.
   * This handles both bare IDs and wrapped format from export.
   */
  const parsedId = parseThreadId(threadId);

  /**
   * BlockNote stores threads with the thread ID as the key.
   * First, try direct key lookup (most efficient).
   */
  const directLookup = threadsData[parsedId];
  if (directLookup) {
    const result = ThreadSchema.safeParse(directLookup);
    if (result.success) {
      return result.data;
    }
  }

  /**
   * Fallback: iterate through all threads and match by thread.id field.
   * This handles cases where the key might not match the thread.id.
   */
  for (const [_key, value] of Object.entries(threadsData)) {
    const result = ThreadSchema.safeParse(value);
    if (result.success && result.data.id === parsedId) {
      return result.data;
    }
  }

  return null;
}

/**
 * Get a specific PR review comment by ID.
 * @returns The comment if found, null otherwise.
 */
export function getPRReviewCommentById(ydoc: Y.Doc, commentId: string): PRReviewComment | null {
  const comments = getPRReviewComments(ydoc);
  return comments.find((c) => c.id === commentId) ?? null;
}

/**
 * Get a specific local diff comment by ID.
 * @returns The comment if found, null otherwise.
 */
export function getLocalDiffCommentById(ydoc: Y.Doc, commentId: string): LocalDiffComment | null {
  const comments = getLocalDiffComments(ydoc);
  return comments.find((c) => c.id === commentId) ?? null;
}

/**
 * Reply to a PR review comment by creating a new comment with inReplyTo set.
 * @param ydoc - The Y.Doc
 * @param parentCommentId - ID of the comment to reply to
 * @param body - Reply text
 * @param author - Author of the reply
 * @param actor - Optional actor name for transaction tracking
 * @returns The newly created reply comment
 * @throws Error if parent comment not found
 */
export function replyToPRReviewComment(
  ydoc: Y.Doc,
  parentCommentId: string,
  body: string,
  author: string,
  actor?: string
): PRReviewComment {
  const parentComment = getPRReviewCommentById(ydoc, parentCommentId);

  if (!parentComment) {
    throw new Error(`PR review comment not found: ${parentCommentId}`);
  }

  const reply: PRReviewComment = {
    id: nanoid(),
    prNumber: parentComment.prNumber,
    path: parentComment.path,
    line: parentComment.line,
    body,
    author,
    createdAt: Date.now(),
    inReplyTo: parentCommentId,
  };

  addPRReviewComment(ydoc, reply, actor);
  return reply;
}

/**
 * Reply to a local diff comment by creating a new comment with inReplyTo set.
 * @param ydoc - The Y.Doc
 * @param parentCommentId - ID of the comment to reply to
 * @param body - Reply text
 * @param author - Author of the reply
 * @param actor - Optional actor name for transaction tracking
 * @returns The newly created reply comment
 * @throws Error if parent comment not found
 */
export function replyToLocalDiffComment(
  ydoc: Y.Doc,
  parentCommentId: string,
  body: string,
  author: string,
  actor?: string
): LocalDiffComment {
  const parentComment = getLocalDiffCommentById(ydoc, parentCommentId);

  if (!parentComment) {
    throw new Error(`Local diff comment not found: ${parentCommentId}`);
  }

  const reply: LocalDiffComment = {
    id: nanoid(),
    type: 'local',
    path: parentComment.path,
    line: parentComment.line,
    body,
    author,
    createdAt: Date.now(),
    baseRef: parentComment.baseRef,
    lineContentHash: parentComment.lineContentHash,
    inReplyTo: parentCommentId,
  };

  addLocalDiffComment(ydoc, reply, actor);
  return reply;
}

function extractViewedByFromCrdt(existingViewedBy: unknown): Record<string, number> {
  const viewedBy: Record<string, number> = {};

  if (existingViewedBy instanceof Y.Map) {
    for (const [key, value] of existingViewedBy.entries()) {
      if (typeof key === 'string' && typeof value === 'number') {
        viewedBy[key] = value;
      }
    }
  } else if (
    existingViewedBy &&
    typeof existingViewedBy === 'object' &&
    !Array.isArray(existingViewedBy)
  ) {
    for (const [key, value] of Object.entries(existingViewedBy)) {
      if (typeof value === 'number') {
        viewedBy[key] = value;
      }
    }
  }

  return viewedBy;
}

export function markPlanAsViewed(ydoc: Y.Doc, username: string): void {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);

  ydoc.transact(() => {
    const existingViewedBy = map.get('viewedBy');
    const viewedBy: Record<string, number> = extractViewedByFromCrdt(existingViewedBy);

    viewedBy[username] = Date.now();

    const viewedByMap = new Y.Map<number>();
    for (const [user, timestamp] of Object.entries(viewedBy)) {
      viewedByMap.set(user, timestamp);
    }
    map.set('viewedBy', viewedByMap);
  });
}

export function getViewedBy(ydoc: Y.Doc): Record<string, number> {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const viewedBy = map.get('viewedBy');
  return extractViewedByFromCrdt(viewedBy);
}

export function isPlanUnread(
  metadata: Pick<PlanMetadata, 'updatedAt'>,
  username: string,
  viewedBy?: Record<string, number>
): boolean {
  const viewed = viewedBy ?? {};
  const lastViewed = viewed[username];

  if (!lastViewed) return true;

  return lastViewed < metadata.updatedAt;
}

export function getConversationVersions(ydoc: Y.Doc): ConversationVersion[] {
  const metadata = getPlanMetadata(ydoc);
  return metadata?.conversationVersions || [];
}

export function addConversationVersion(
  ydoc: Y.Doc,
  version: ConversationVersion,
  actor?: string
): void {
  const validated = ConversationVersionSchema.parse(version);

  ydoc.transact(
    () => {
      const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
      const rawVersions = metadata.get('conversationVersions');
      let versions: ConversationVersion[] = [];
      if (Array.isArray(rawVersions)) {
        versions = rawVersions
          .map((v) => ConversationVersionSchema.safeParse(v))
          .filter((r) => r.success)
          .map((r) => r.data);
      }
      metadata.set('conversationVersions', [...versions, validated]);
    },
    actor ? { actor } : undefined
  );
}

export function markVersionHandedOff(
  ydoc: Y.Doc,
  versionId: string,
  handedOffTo: string,
  actor?: string
): void {
  const versions = getConversationVersions(ydoc);
  const updated = versions.map((v) => {
    if (v.versionId !== versionId) return v;

    const handedOffVersion = {
      ...v,
      handedOff: true as const,
      handedOffAt: Date.now(),
      handedOffTo,
    };

    return ConversationVersionSchema.parse(handedOffVersion);
  });

  ydoc.transact(
    () => {
      const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
      metadata.set('conversationVersions', updated);
    },
    actor ? { actor } : undefined
  );
}

/**
 * Type-safe helper to extract data type for a specific event type.
 * Used to ensure correct data payload for each event type.
 * Handles both required and optional data fields.
 */
type EventDataForType<T extends PlanEventType> =
  Extract<PlanEvent, { type: T }> extends infer E
    ? E extends { data: infer D }
      ? D
      : E extends { data?: infer D }
        ? D | undefined
        : undefined
    : never;

/**
 * Log a plan event with type-safe data payload.
 * TypeScript will enforce that the data parameter matches the event type.
 * @returns The ID of the created event (either provided or generated)
 */
export function logPlanEvent<T extends PlanEventType>(
  ydoc: Y.Doc,
  type: T,
  actor: string,
  ...args: EventDataForType<T> extends undefined
    ? [
        data?: undefined,
        options?: {
          id?: string;
          inboxWorthy?: boolean;
          inboxFor?: string | string[];
        },
      ]
    : [
        data: EventDataForType<T>,
        options?: {
          id?: string;
          inboxWorthy?: boolean;
          inboxFor?: string | string[];
        },
      ]
): string {
  const eventsArray = ydoc.getArray<PlanEvent>(YDOC_KEYS.EVENTS);
  const [data, options] = args;

  const eventId = options?.id ?? nanoid();

  const baseEvent = {
    id: eventId,
    type,
    actor,
    timestamp: Date.now(),
    inboxWorthy: options?.inboxWorthy,
    inboxFor: options?.inboxFor,
  };

  const rawEvent = data !== undefined ? { ...baseEvent, data } : baseEvent;

  const parsed = PlanEventSchema.safeParse(rawEvent);
  if (!parsed.success) {
    throw new Error(`Invalid plan event: ${parsed.error.message}`);
  }

  eventsArray.push([parsed.data]);
  return eventId;
}

export function getPlanEvents(ydoc: Y.Doc): PlanEvent[] {
  const array = ydoc.getArray<PlanEvent>(YDOC_KEYS.EVENTS);
  const data = toUnknownArray(array);

  return data
    .map((item) => PlanEventSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

/**
 * Get all snapshots from the Y.Doc.
 * Returns snapshots sorted by createdAt (oldest first).
 */
export function getSnapshots(ydoc: Y.Doc): PlanSnapshot[] {
  const array = ydoc.getArray<PlanSnapshot>(YDOC_KEYS.SNAPSHOTS);
  const data = toUnknownArray(array);

  return data
    .map((item) => PlanSnapshotSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Add a snapshot to the Y.Doc.
 * Snapshots are append-only for CRDT correctness.
 */
export function addSnapshot(ydoc: Y.Doc, snapshot: PlanSnapshot, actor?: string): void {
  const validated = PlanSnapshotSchema.parse(snapshot);

  ydoc.transact(
    () => {
      const array = ydoc.getArray<PlanSnapshot>(YDOC_KEYS.SNAPSHOTS);
      array.push([validated]);
    },
    actor ? { actor } : undefined
  );
}

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
export function createPlanSnapshot(
  ydoc: Y.Doc,
  reason: string,
  actor: string,
  status: PlanStatusType,
  blocks: unknown[]
): PlanSnapshot {
  const threadsMap = ydoc.getMap<Record<string, unknown>>(YDOC_KEYS.THREADS);
  const rawThreadsData = threadsMap.toJSON();
  const threadsData: Record<string, unknown> =
    rawThreadsData && typeof rawThreadsData === 'object'
      ? Object.fromEntries(Object.entries(rawThreadsData))
      : {};
  const threads = parseThreads(threadsData);
  const unresolved = threads.filter((t) => !t.resolved).length;

  const artifacts = getArtifacts(ydoc);
  const deliverables = getDeliverables(ydoc);

  return {
    id: nanoid(),
    status,
    createdBy: actor,
    reason,
    createdAt: Date.now(),
    content: blocks,
    threadSummary:
      threads.length > 0
        ? {
            total: threads.length,
            unresolved,
          }
        : undefined,
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    deliverables: deliverables.length > 0 ? deliverables : undefined,
  };
}

/**
 * Get the latest snapshot from the Y.Doc.
 * Returns null if no snapshots exist.
 */
export function getLatestSnapshot(ydoc: Y.Doc): PlanSnapshot | null {
  const snapshots = getSnapshots(ydoc);
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1] ?? null;
}

function getValidatedTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  return rawTags.filter((t): t is string => typeof t === 'string');
}

/**
 * Add a tag to a plan (automatically normalizes and deduplicates).
 * Tags are normalized to lowercase and trimmed to prevent duplicates.
 */
export function addPlanTag(ydoc: Y.Doc, tag: string, actor?: string): void {
  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      const currentTags = getValidatedTags(map.get('tags'));

      const normalizedTag = tag.toLowerCase().trim();
      if (!normalizedTag || currentTags.includes(normalizedTag)) return;

      map.set('tags', [...currentTags, normalizedTag]);
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );
}

/**
 * Remove a tag from a plan.
 */
export function removePlanTag(ydoc: Y.Doc, tag: string, actor?: string): void {
  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      const currentTags = getValidatedTags(map.get('tags'));
      const normalizedTag = tag.toLowerCase().trim();

      map.set(
        'tags',
        currentTags.filter((t) => t !== normalizedTag)
      );
      map.set('updatedAt', Date.now());
    },
    actor ? { actor } : undefined
  );
}

/**
 * Get all unique tags from a list of plan index entries (for autocomplete).
 * Returns sorted array of unique tags.
 */
export function getAllTagsFromIndex(indexEntries: Array<{ tags?: string[] }>): string[] {
  const tagSet = new Set<string>();

  for (const entry of indexEntries) {
    if (entry.tags) {
      for (const tag of entry.tags) {
        tagSet.add(tag);
      }
    }
  }

  return Array.from(tagSet).sort();
}

/**
 * Result type for archive operations.
 */
export type ArchiveResult = { success: true } | { success: false; error: string };

/**
 * Archive a plan - marks it as archived with timestamp and actor.
 * Validates that the plan exists and is not already archived.
 */
export function archivePlan(ydoc: Y.Doc, actorId: string): ArchiveResult {
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    return { success: false, error: 'Plan metadata not found' };
  }

  if (metadata.archivedAt) {
    return { success: false, error: 'Plan is already archived' };
  }

  ydoc.transact(
    () => {
      const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
      metadataMap.set('archivedAt', Date.now());
      metadataMap.set('archivedBy', actorId);
      metadataMap.set('updatedAt', Date.now());
    },
    { actor: actorId }
  );

  return { success: true };
}

/**
 * Unarchive a plan - removes archived status.
 * Validates that the plan exists and is currently archived.
 */
export function unarchivePlan(ydoc: Y.Doc, actorId: string): ArchiveResult {
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    return { success: false, error: 'Plan metadata not found' };
  }

  if (!metadata.archivedAt) {
    return { success: false, error: 'Plan is not archived' };
  }

  ydoc.transact(
    () => {
      const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
      metadataMap.delete('archivedAt');
      metadataMap.delete('archivedBy');
      metadataMap.set('updatedAt', Date.now());
    },
    { actor: actorId }
  );

  return { success: true };
}

/**
 * Answer a pending input request with validation.
 * Used by browser UI when user responds to input request modal.
 */
/** Result type for input request answer operation */
export type AnswerInputRequestResult =
  | { success: true }
  | { success: false; error: 'Request not found' }
  | { success: false; error: 'Request already answered'; answeredBy?: string }
  | { success: false; error: 'Request was declined' }
  | { success: false; error: 'Request was cancelled' }
  | { success: false; error: 'Request is not pending' };

export function answerInputRequest(
  ydoc: Y.Doc,
  requestId: string,
  response: string,
  answeredBy: string
): AnswerInputRequestResult {
  const requestsArray = ydoc.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS);
  const data = toUnknownArray(requestsArray);

  const found = findInputRequestById(data, requestId);
  if (!found) {
    return { success: false, error: 'Request not found' };
  }

  const { rawIndex: index, request } = found;

  if (request.status !== 'pending') {
    switch (request.status) {
      case 'answered':
        return {
          success: false,
          error: 'Request already answered',
          answeredBy: request.answeredBy,
        };
      case 'declined':
        return { success: false, error: 'Request was declined' };
      case 'cancelled':
        return { success: false, error: 'Request was cancelled' };
      default:
        return { success: false, error: `Request is not pending` };
    }
  }

  const answeredRequest = {
    ...request,
    status: 'answered' as const,
    response,
    answeredAt: Date.now(),
    answeredBy,
  };

  const validated = InputRequestSchema.parse(answeredRequest);

  ydoc.transact(() => {
    requestsArray.delete(index, 1);
    requestsArray.insert(index, [validated]);

    /**
     * Include original request context for activity visibility.
     * Single-question requests have 'message' field, multi-question requests don't.
     */
    const requestMessage = 'message' in request ? request.message : undefined;

    logPlanEvent(ydoc, 'input_request_answered', answeredBy, {
      requestId,
      response,
      answeredBy,
      requestMessage,
      requestType: request.type,
    });
  });

  return { success: true };
}

/**
 * Answer a pending multi-question input request with validation.
 * Used by browser UI when user responds to multi-question form modal.
 *
 * @param ydoc - Y.Doc containing the request
 * @param requestId - ID of the request to answer
 * @param responses - Record mapping question index ("0", "1", etc.) to response value
 * @param answeredBy - Username or identifier of the responder
 */
export function answerMultiQuestionInputRequest(
  ydoc: Y.Doc,
  requestId: string,
  responses: Record<string, unknown>,
  answeredBy: string
): AnswerInputRequestResult {
  const requestsArray = ydoc.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS);
  const data = toUnknownArray(requestsArray);

  const found = findInputRequestById(data, requestId);
  if (!found) {
    return { success: false, error: 'Request not found' };
  }

  const { rawIndex: index, request } = found;

  if (request.type !== 'multi') {
    return { success: false, error: 'Request is not pending' };
  }

  if (request.status !== 'pending') {
    switch (request.status) {
      case 'answered':
        return {
          success: false,
          error: 'Request already answered',
          answeredBy: request.answeredBy,
        };
      case 'declined':
        return { success: false, error: 'Request was declined' };
      case 'cancelled':
        return { success: false, error: 'Request was cancelled' };
      default:
        return { success: false, error: `Request is not pending` };
    }
  }

  const answeredRequest: MultiQuestionInputRequest = {
    ...request,
    status: 'answered' as const,
    responses,
    answeredAt: Date.now(),
    answeredBy,
  };

  const validated = MultiQuestionInputRequestSchema.parse(answeredRequest);

  ydoc.transact(() => {
    requestsArray.delete(index, 1);
    requestsArray.insert(index, [validated]);

    logPlanEvent(ydoc, 'input_request_answered', answeredBy, {
      requestId,
      response: responses,
      answeredBy,
      requestType: 'multi',
    });
  });

  return { success: true };
}

/**
 * Cancel a pending input request due to timeout or programmatic cancellation.
 * Sets status to 'cancelled'. For user-initiated decline, use declineInputRequest().
 */
export function cancelInputRequest(
  ydoc: Y.Doc,
  requestId: string
): { success: boolean; error?: string } {
  const requestsArray = ydoc.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS);
  const data = toUnknownArray(requestsArray);

  const found = findInputRequestById(data, requestId);
  if (!found) {
    return { success: false, error: 'Request not found' };
  }

  const { rawIndex: index, request } = found;

  if (request.status !== 'pending') {
    return { success: false, error: `Request is not pending` };
  }

  const cancelledRequest = {
    ...request,
    status: 'cancelled' as const,
  };

  const validated =
    request.type === 'multi'
      ? MultiQuestionInputRequestSchema.parse(cancelledRequest)
      : InputRequestSchema.parse(cancelledRequest);

  ydoc.transact(() => {
    requestsArray.delete(index, 1);
    requestsArray.insert(index, [validated]);
  });

  return { success: true };
}

/**
 * Decline a pending input request.
 * Used when user explicitly clicks "Decline" button in the UI.
 * Sets status to 'declined' (distinct from 'cancelled' which is for timeouts).
 */
export function declineInputRequest(
  ydoc: Y.Doc,
  requestId: string
): { success: boolean; error?: string } {
  const requestsArray = ydoc.getArray<AnyInputRequest>(YDOC_KEYS.INPUT_REQUESTS);
  const data = toUnknownArray(requestsArray);

  const found = findInputRequestById(data, requestId);
  if (!found) {
    return { success: false, error: 'Request not found' };
  }

  const { rawIndex: index, request } = found;

  if (request.status !== 'pending') {
    return { success: false, error: `Request is not pending` };
  }

  const declinedRequest = {
    ...request,
    status: 'declined' as const,
  };

  const validated =
    request.type === 'multi'
      ? MultiQuestionInputRequestSchema.parse(declinedRequest)
      : InputRequestSchema.parse(declinedRequest);

  ydoc.transact(() => {
    requestsArray.delete(index, 1);
    requestsArray.insert(index, [validated]);

    logPlanEvent(ydoc, 'input_request_declined', 'User', {
      requestId,
    });
  });

  return { success: true };
}

/**
 * Result type for atomic token regeneration operation.
 * Discriminated union for type-safe handling of success/failure cases.
 */
export type AtomicRegenerateTokenResult =
  | { success: true }
  | { success: false; actualOwner: string | undefined };

/**
 * Atomically regenerate session token if the current user is the owner.
 *
 * This function performs ownership verification and token update in a single
 * Y.Doc transaction, preventing TOCTOU race conditions where ownership could
 * change between the check and the update.
 *
 * @param ydoc - The Y.Doc containing the plan
 * @param expectedOwnerId - The owner ID that must match for the operation to proceed
 * @param newTokenHash - The new session token hash to set
 * @param actor - Optional actor name for transaction metadata
 * @returns Result indicating success or failure with actual owner if mismatched
 */
export function atomicRegenerateTokenIfOwner(
  ydoc: Y.Doc,
  expectedOwnerId: string,
  newTokenHash: string,
  actor?: string
): AtomicRegenerateTokenResult {
  let result: AtomicRegenerateTokenResult = { success: false, actualOwner: undefined };

  ydoc.transact(
    () => {
      const map = ydoc.getMap(YDOC_KEYS.METADATA);
      const rawOwnerId = map.get('ownerId');
      const currentOwner = typeof rawOwnerId === 'string' ? rawOwnerId : undefined;

      if (currentOwner !== expectedOwnerId) {
        result = { success: false, actualOwner: currentOwner };
        return;
      }

      map.set('sessionTokenHash', newTokenHash);
      map.set('updatedAt', Date.now());
      result = { success: true };
    },
    actor ? { actor } : undefined
  );

  return result;
}
