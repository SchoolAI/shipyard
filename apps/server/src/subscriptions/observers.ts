/**
 * Y.Doc observers for detecting changes and notifying subscriptions.
 */

import {
  type Artifact,
  extractMentions,
  getDeliverables,
  getPlanMetadata,
  logPlanEvent,
  type PlanMetadata,
  type PlanStatusType,
  PlanStatusValues,
  parseThreads,
  type Thread,
  type ThreadComment,
  YDOC_KEYS,
} from '@shipyard/schema';
import type * as Y from 'yjs';
import { logger } from '../logger.js';
import { notifyChange } from './manager.js';
import type { Change } from './types.js';

/**
 * Tracks previous Y.Doc state to detect diffs.
 * We can't determine what changed from raw Y.update events,
 * so we snapshot state and compare on each observer callback.
 */
interface PlanState {
  status?: PlanStatusType;
  commentCount: number;
  resolvedCount: number;
  contentLength: number;
  artifactCount: number;
  deliverablesFulfilled: boolean;
  /** Track comment IDs to detect new comments */
  commentIds: Set<string>;
}

const previousState = new Map<string, PlanState>();

// Debounce state for content edits to prevent event spam
const lastContentEdit = new Map<string, number>();
const CONTENT_EDIT_DEBOUNCE_MS = 5000;

// --- Public API ---

export function attachObservers(planId: string, doc: Y.Doc): void {
  const metadata = getPlanMetadata(doc);
  const threadsMap = doc.getMap<Record<string, Thread>>(YDOC_KEYS.THREADS);
  const threads = parseThreads(threadsMap.toJSON() as Record<string, unknown>);
  const deliverables = getDeliverables(doc);
  const allFulfilled = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

  // Build initial set of comment IDs
  const initialCommentIds = new Set<string>();
  for (const thread of threads) {
    for (const comment of thread.comments) {
      initialCommentIds.add(comment.id);
    }
  }

  previousState.set(planId, {
    status: metadata?.status,
    commentCount: threads.reduce((acc, t) => acc + t.comments.length, 0),
    resolvedCount: threads.filter((t) => t.resolved).length,
    contentLength: doc.getXmlFragment('document').length,
    artifactCount: doc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS).length,
    deliverablesFulfilled: allFulfilled,
    commentIds: initialCommentIds,
  });

  logger.debug({ planId }, 'Attached observers to plan');
  doc.getMap<PlanMetadata>(YDOC_KEYS.METADATA).observe((event, transaction) => {
    if (event.keysChanged.has('status')) {
      const prev = previousState.get(planId);
      // Runtime validation: ensure status value is a valid PlanStatusType
      const rawStatus = doc.getMap<PlanMetadata>(YDOC_KEYS.METADATA).get('status');
      const newStatus =
        typeof rawStatus === 'string' && PlanStatusValues.includes(rawStatus as PlanStatusType)
          ? (rawStatus as PlanStatusType)
          : undefined;

      if (prev?.status && prev.status !== newStatus && newStatus) {
        const actor = transaction.origin?.actor || 'System';

        // Log event
        logPlanEvent(doc, 'status_changed', actor, {
          fromStatus: prev.status,
          toStatus: newStatus,
        });

        // Notify subscriptions
        const change: Change = {
          type: 'status',
          timestamp: Date.now(),
          summary: `Status changed to ${newStatus}`,
          details: { oldValue: prev.status, newValue: newStatus },
        };
        notifyChange(planId, change);
        prev.status = newStatus;

        logger.debug({ planId, oldStatus: prev.status, newStatus }, 'Status change detected');
      }
    }
  });

  doc.getMap<Record<string, Thread>>(YDOC_KEYS.THREADS).observeDeep((_events, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const actor = transaction.origin?.actor || 'System';
    const threadsMap = doc.getMap<Record<string, Thread>>(YDOC_KEYS.THREADS);
    const threads = parseThreads(threadsMap.toJSON() as Record<string, unknown>);

    handleNewComments(doc, planId, threads, prev, actor);
    handleResolvedComments(doc, planId, threads, prev, actor);
  });

  // Watch the document fragment (source of truth) for content changes
  doc.getXmlFragment('document').observeDeep((_events, transaction) => {
    const now = Date.now();
    const lastEdit = lastContentEdit.get(planId) || 0;

    // Only log if 5 seconds have passed since last edit (prevent event spam)
    if (now - lastEdit > CONTENT_EDIT_DEBOUNCE_MS) {
      const actor = transaction.origin?.actor || 'System';
      logPlanEvent(doc, 'content_edited', actor);
      lastContentEdit.set(planId, now);
    }

    // Always notify subscriptions (don't debounce notifications)
    notifyChange(planId, {
      type: 'content',
      timestamp: Date.now(),
      summary: 'Content updated',
    });

    logger.debug({ planId }, 'Content change detected');
  });

  doc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS).observe((_event, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const actor = transaction.origin?.actor || 'System';
    const newCount = doc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS).length;

    if (newCount > prev.artifactCount) {
      const diff = newCount - prev.artifactCount;
      const artifacts = doc.getArray<Artifact>(YDOC_KEYS.ARTIFACTS).toArray();
      const newArtifact = artifacts[artifacts.length - 1] as { id: string };

      // Log event
      logPlanEvent(doc, 'artifact_uploaded', actor, {
        artifactId: newArtifact.id,
      });

      // Notify subscriptions
      notifyChange(planId, {
        type: 'artifacts',
        timestamp: Date.now(),
        summary: `${diff} artifact(s) added`,
        details: { added: diff },
      });
      prev.artifactCount = newCount;

      logger.debug({ planId, added: diff }, 'Artifacts added detected');
    }
  });

  // Watch deliverables array for fulfillment (inbox-worthy event)
  doc.getArray(YDOC_KEYS.DELIVERABLES).observeDeep((_events, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const deliverables = getDeliverables(doc);
    const allFulfilled = deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

    // Detect transition to all fulfilled
    if (allFulfilled && !prev.deliverablesFulfilled) {
      const actor = transaction.origin?.actor || 'System';

      // Log inbox-worthy event (owner should mark plan as complete)
      logPlanEvent(
        doc,
        'deliverable_linked',
        actor,
        {
          allFulfilled: true,
        },
        {
          inboxWorthy: true,
          inboxFor: 'owner',
        }
      );

      prev.deliverablesFulfilled = true;
      logger.debug({ planId }, 'All deliverables fulfilled - inbox-worthy event logged');
    }
  });
}

/**
 * Detach observers from a plan (cleanup state).
 * Call when a doc is destroyed.
 */
export function detachObservers(planId: string): void {
  previousState.delete(planId);
  lastContentEdit.delete(planId);
  logger.debug({ planId }, 'Detached observers from plan');
}

/**
 * Check if observers are attached for a plan.
 */
export function hasObservers(planId: string): boolean {
  return previousState.has(planId);
}

// --- Helper Functions (private) ---

/**
 * Find comments that don't exist in the previous state's ID set.
 */
function detectNewComments(threads: Thread[], prevCommentIds: Set<string>): ThreadComment[] {
  const newComments: ThreadComment[] = [];
  for (const thread of threads) {
    for (const comment of thread.comments) {
      if (!prevCommentIds.has(comment.id)) {
        newComments.push(comment);
      }
    }
  }
  return newComments;
}

/**
 * Log a comment event with @mention detection for inbox-worthy flagging.
 */
function logCommentWithMentions(
  doc: Y.Doc,
  planId: string,
  comment: ThreadComment,
  actor: string
): void {
  const mentions = extractMentions(comment.body);
  const hasMentions = mentions.length > 0;

  logPlanEvent(
    doc,
    'comment_added',
    actor,
    { commentId: comment.id, mentions: hasMentions },
    {
      inboxWorthy: hasMentions,
      inboxFor: hasMentions ? mentions : undefined,
    }
  );

  if (hasMentions) {
    logger.debug(
      { planId, commentId: comment.id, mentions },
      'Comment with @mentions logged as inbox-worthy'
    );
  }
}

/**
 * Process new comments: detect them, log events, and notify subscriptions.
 */
function handleNewComments(
  doc: Y.Doc,
  planId: string,
  threads: Thread[],
  prev: PlanState,
  actor: string
): void {
  const newCommentCount = threads.reduce((acc, t) => acc + t.comments.length, 0);
  if (newCommentCount <= prev.commentCount) return;

  const diff = newCommentCount - prev.commentCount;
  const newComments = detectNewComments(threads, prev.commentIds);

  // Update tracking state for each new comment
  for (const comment of newComments) {
    prev.commentIds.add(comment.id);
    logCommentWithMentions(doc, planId, comment, actor);
  }

  notifyChange(planId, {
    type: 'comments',
    timestamp: Date.now(),
    summary: `${diff} new comment(s)`,
    details: { added: diff },
  });
  prev.commentCount = newCommentCount;

  logger.debug({ planId, added: diff }, 'New comments detected');
}

/**
 * Process resolved comments: detect resolution changes, log events, and notify subscriptions.
 */
function handleResolvedComments(
  doc: Y.Doc,
  planId: string,
  threads: Thread[],
  prev: PlanState,
  actor: string
): void {
  const newResolvedCount = threads.filter((t) => t.resolved).length;
  if (newResolvedCount <= prev.resolvedCount) return;

  const diff = newResolvedCount - prev.resolvedCount;

  logPlanEvent(doc, 'comment_resolved', actor, { resolvedCount: diff });

  notifyChange(planId, {
    type: 'resolved',
    timestamp: Date.now(),
    summary: `${diff} comment(s) resolved`,
    details: { resolved: diff },
  });
  prev.resolvedCount = newResolvedCount;

  logger.debug({ planId, resolved: diff }, 'Comments resolved detected');
}
