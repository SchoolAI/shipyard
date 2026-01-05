/**
 * Y.Doc observers for detecting changes and notifying subscriptions.
 */

import { getPlanMetadata, parseThreads } from '@peer-plan/schema';
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
  status?: string;
  commentCount: number;
  resolvedCount: number;
  contentLength: number;
  artifactCount: number;
}

const previousState = new Map<string, PlanState>();

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
  doc.getMap('metadata').observe((event) => {
    if (event.keysChanged.has('status')) {
      const prev = previousState.get(planId);
      const newStatus = doc.getMap('metadata').get('status') as string | undefined;

      if (prev && prev.status !== newStatus && newStatus) {
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

  doc.getMap('threads').observeDeep(() => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const threadsMap = doc.getMap('threads');
    const threads = parseThreads(threadsMap.toJSON() as Record<string, unknown>);
    const newCommentCount = threads.reduce((acc, t) => acc + t.comments.length, 0);
    const newResolvedCount = threads.filter((t) => t.resolved).length;

    if (newCommentCount > prev.commentCount) {
      const diff = newCommentCount - prev.commentCount;
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
  doc.getXmlFragment('document').observeDeep(() => {
    notifyChange(planId, {
      type: 'content',
      timestamp: Date.now(),
      summary: 'Content updated',
    });

    logger.debug({ planId }, 'Content change detected');
  });

  doc.getArray('artifacts').observe(() => {
    const prev = previousState.get(planId);
    if (!prev) return;

    const newCount = doc.getArray('artifacts').length;
    if (newCount > prev.artifactCount) {
      const diff = newCount - prev.artifactCount;
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
  logger.debug({ planId }, 'Detached observers from plan');
}

/**
 * Check if observers are attached for a plan.
 */
export function hasObservers(planId: string): boolean {
  return previousState.has(planId);
}
