/**
 * Subscription manager for tracking change notifications.
 * Handles batching, flushing, and cleanup of stale subscriptions.
 */

import { nanoid } from 'nanoid';
import { logger } from '../logger.js';
import { startPeriodicCleanup as startSessionCleanup } from '../session-registry.js';
import type { Change, ChangesResponse, Subscription, SubscriptionConfig } from './types.js';

/** --- State --- */

const subscriptions = new Map<string, Map<string, Subscription>>();
const SUBSCRIPTION_TTL_MS = 5 * 60 * 1000;

/** --- Public API --- */

export function createSubscription(config: SubscriptionConfig): string {
  const id = nanoid();
  const now = Date.now();

  const subscription: Subscription = {
    id,
    config,
    pendingChanges: [],
    windowStartedAt: null,
    lastFlushedAt: now,
    lastActivityAt: now,
    ready: false,
  };

  let planSubs = subscriptions.get(config.planId);
  if (!planSubs) {
    planSubs = new Map();
    subscriptions.set(config.planId, planSubs);
  }
  planSubs.set(id, subscription);

  logger.info(
    { planId: config.planId, subscriptionId: id, subscribe: config.subscribe },
    'Subscription created'
  );

  return id;
}

export function deleteSubscription(planId: string, subscriptionId: string): boolean {
  const deleted = subscriptions.get(planId)?.delete(subscriptionId) ?? false;

  if (deleted) {
    logger.info({ planId, subscriptionId }, 'Subscription deleted');

    if (subscriptions.get(planId)?.size === 0) {
      subscriptions.delete(planId);
    }
  }

  return deleted;
}

export function notifyChange(planId: string, change: Change): void {
  const planSubs = subscriptions.get(planId);
  if (!planSubs) return;

  const now = Date.now();

  for (const sub of planSubs.values()) {
    if (!sub.config.subscribe.includes(change.type)) continue;

    sub.pendingChanges.push(change);
    sub.lastActivityAt = now;

    if (sub.windowStartedAt === null) {
      sub.windowStartedAt = now;
    }

    checkFlushConditions(sub);
  }

  logger.debug(
    { planId, changeType: change.type, subscriberCount: planSubs.size },
    'Change notified'
  );
}

export function getChanges(planId: string, subscriptionId: string): ChangesResponse | null {
  const sub = subscriptions.get(planId)?.get(subscriptionId);
  if (!sub) return null;

  const now = Date.now();
  sub.lastActivityAt = now;

  checkFlushConditions(sub);

  if (!sub.ready) {
    return {
      ready: false,
      pending: sub.pendingChanges.length,
      windowExpiresIn: sub.windowStartedAt
        ? Math.max(0, sub.config.windowMs - (now - sub.windowStartedAt))
        : sub.config.windowMs,
    };
  }

  const changes = sub.pendingChanges;
  const summary = summarizeChanges(changes);

  sub.pendingChanges = [];
  sub.windowStartedAt = null;
  sub.lastFlushedAt = now;
  sub.ready = false;

  logger.debug({ planId, subscriptionId, changeCount: changes.length }, 'Changes flushed');

  return {
    ready: true,
    changes: summary,
    details: changes,
  };
}

export function startCleanupInterval(): void {
  /** Start session registry cleanup (runs every 15 minutes) */
  startSessionCleanup();

  /** Start subscription cleanup (runs every 60 seconds) */
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [planId, planSubs] of subscriptions.entries()) {
      for (const [subId, sub] of planSubs.entries()) {
        if (now - sub.lastActivityAt > SUBSCRIPTION_TTL_MS) {
          planSubs.delete(subId);
          cleanedCount++;
        }
      }
      if (planSubs.size === 0) {
        subscriptions.delete(planId);
      }
    }

    if (cleanedCount > 0) {
      logger.info({ cleanedCount }, 'Cleaned up stale subscriptions');
    }
  }, 60000);
}

export function getSubscription(planId: string, subscriptionId: string): Subscription | undefined {
  return subscriptions.get(planId)?.get(subscriptionId);
}

export function getSubscriptionsForPlan(planId: string): Map<string, Subscription> | undefined {
  return subscriptions.get(planId);
}

/** --- Private Helpers --- */

function checkFlushConditions(sub: Subscription): void {
  const now = Date.now();
  const { windowMs, maxWindowMs, threshold } = sub.config;

  if (sub.pendingChanges.length >= threshold) {
    sub.ready = true;
    return;
  }

  if (sub.windowStartedAt && now - sub.windowStartedAt >= windowMs) {
    sub.ready = true;
    return;
  }

  if (now - sub.lastFlushedAt >= maxWindowMs && sub.pendingChanges.length > 0) {
    sub.ready = true;
  }
}

function summarizeChanges(changes: Change[]): string {
  const parts: string[] = [];

  const statusChanges = changes.filter((c) => c.type === 'status');
  if (statusChanges.length > 0) {
    const latest = statusChanges[statusChanges.length - 1];
    if (latest) {
      parts.push(`Status: ${latest.details?.newValue}`);
    }
  }

  const commentChanges = changes.filter((c) => c.type === 'comments');
  if (commentChanges.length > 0) {
    const totalAdded = commentChanges.reduce((acc, c) => {
      const added = c.details?.added;
      return acc + (typeof added === 'number' ? added : 1);
    }, 0);
    parts.push(`${totalAdded} new comment(s)`);
  }

  const resolvedChanges = changes.filter((c) => c.type === 'resolved');
  if (resolvedChanges.length > 0) {
    const totalResolved = resolvedChanges.reduce((acc, c) => {
      const resolved = c.details?.resolved;
      return acc + (typeof resolved === 'number' ? resolved : 1);
    }, 0);
    parts.push(`${totalResolved} resolved`);
  }

  const contentChanges = changes.filter((c) => c.type === 'content');
  if (contentChanges.length > 0) {
    parts.push('Content updated');
  }

  const artifactChanges = changes.filter((c) => c.type === 'artifacts');
  if (artifactChanges.length > 0) {
    const totalAdded = artifactChanges.reduce((acc, c) => {
      const added = c.details?.added;
      return acc + (typeof added === 'number' ? added : 1);
    }, 0);
    parts.push(`${totalAdded} artifact(s) added`);
  }

  return parts.join(' | ') || 'No changes';
}
