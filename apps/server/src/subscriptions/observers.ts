/**
 * Y.Doc observers for detecting changes and notifying subscriptions.
 */

import {
  getPlanMetadata,
  logPlanEvent,
  type PlanStatusType,
  parseThreads,
} from '@peer-plan/schema';
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
}

const previousState = new Map<string, PlanState>();

// Debounce state for content edits to prevent event spam
const lastContentEdit = new Map<string, number>();
const CONTENT_EDIT_DEBOUNCE_MS = 5000;

// --- Public API ---

export function attachObservers(planId: string, doc: Y.Doc): void {
  const metadata = getPlanMetadata(doc);
  const threadsMap = doc.getMap('threads');
  const threads = parseThreads(threadsMap.toJSON() as Record<string, unknown>);

  previousState.set(planId, {
    status: metadata?.status,
    commentCount: threads.reduce((acc, t) => acc + t.comments.length, 0),
    resolvedCount: threads.filter((t) => t.resolved).length,
    contentLength: doc.getXmlFragment('document').length,
    artifactCount: doc.getArray('artifacts').length,
  });

  logger.debug({ planId }, 'Attached observers to plan');
  doc.getMap('metadata').observe((event, transaction) => {
    if (event.keysChanged.has('status')) {
      const prev = previousState.get(planId);
      const newStatus = doc.getMap('metadata').get('status') as PlanStatusType | undefined;

      if (prev && prev.status !== newStatus && newStatus) {
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

  doc.getMap('threads').observeDeep((_events, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const actor = transaction.origin?.actor || 'System';
    const threadsMap = doc.getMap('threads');
    const threads = parseThreads(threadsMap.toJSON() as Record<string, unknown>);
    const newCommentCount = threads.reduce((acc, t) => acc + t.comments.length, 0);
    const newResolvedCount = threads.filter((t) => t.resolved).length;

    if (newCommentCount > prev.commentCount) {
      const diff = newCommentCount - prev.commentCount;

      // Log event
      logPlanEvent(doc, 'comment_added', actor, {
        commentCount: diff,
      });

      // Notify subscriptions
      notifyChange(planId, {
        type: 'comments',
        timestamp: Date.now(),
        summary: `${diff} new comment(s)`,
        details: { added: diff },
      });
      prev.commentCount = newCommentCount;

      logger.debug({ planId, added: diff }, 'New comments detected');
    }

    if (newResolvedCount > prev.resolvedCount) {
      const diff = newResolvedCount - prev.resolvedCount;

      // Log event
      logPlanEvent(doc, 'comment_resolved', actor, {
        resolvedCount: diff,
      });

      // Notify subscriptions
      notifyChange(planId, {
        type: 'resolved',
        timestamp: Date.now(),
        summary: `${diff} comment(s) resolved`,
        details: { resolved: diff },
      });
      prev.resolvedCount = newResolvedCount;

      logger.debug({ planId, resolved: diff }, 'Comments resolved detected');
    }
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

  doc.getArray('artifacts').observe((_event, transaction) => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const actor = transaction.origin?.actor || 'System';
    const newCount = doc.getArray('artifacts').length;

    if (newCount > prev.artifactCount) {
      const diff = newCount - prev.artifactCount;
      const artifacts = doc.getArray('artifacts').toArray();
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
