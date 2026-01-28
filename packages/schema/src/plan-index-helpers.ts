import * as Y from 'yjs';
import {
  PLAN_INDEX_VIEWED_BY_KEY,
  type PlanIndexEntry,
  PlanIndexEntrySchema,
} from './plan-index.js';
import { YDOC_KEYS } from './yjs-keys.js';

/**
 * Gets all plans from the index Y.Doc, sorted by updatedAt (most recent first).
 * By default, filters out archived plans. Pass includeArchived=true to get all plans.
 */
export function getPlanIndex(ydoc: Y.Doc, includeArchived = false): PlanIndexEntry[] {
  const plansMap = ydoc.getMap<PlanIndexEntry>(YDOC_KEYS.PLANS);
  const entries: PlanIndexEntry[] = [];

  for (const [_id, data] of plansMap.entries()) {
    const result = PlanIndexEntrySchema.safeParse(data);
    if (result.success) {
      if (!includeArchived && result.data.deleted) {
        continue;
      }
      entries.push(result.data);
    }
  }

  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Gets a single plan entry from the index.
 */
export function getPlanIndexEntry(ydoc: Y.Doc, planId: string): PlanIndexEntry | null {
  const plansMap = ydoc.getMap<PlanIndexEntry>(YDOC_KEYS.PLANS);
  const data = plansMap.get(planId);
  if (!data) return null;

  const result = PlanIndexEntrySchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Adds or updates a plan in the index.
 */
export function setPlanIndexEntry(ydoc: Y.Doc, entry: PlanIndexEntry): void {
  /*
   * CRITICAL: Validate BEFORE accessing Y.Doc to prevent partial writes on validation failure.
   * Validates discriminated union (deleted: true | false).
   *
   * Why validation-first pattern matters:
   * - If validation throws after Y.Doc access, Y.Doc may contain partial/corrupted state
   * - Pre-validation ensures atomic all-or-nothing behavior
   * - Failed validation returns clear error without touching Y.Doc
   */
  const validated = PlanIndexEntrySchema.parse(entry);

  const plansMap = ydoc.getMap<PlanIndexEntry>(YDOC_KEYS.PLANS);
  plansMap.set(validated.id, validated);
}

/**
 * Removes a plan from the index.
 */
export function removePlanIndexEntry(ydoc: Y.Doc, planId: string): void {
  const plansMap = ydoc.getMap<PlanIndexEntry>(YDOC_KEYS.PLANS);
  plansMap.delete(planId);
}

/**
 * Updates only the updatedAt timestamp for a plan in the index.
 * Useful when plan content changes but not metadata.
 */
export function touchPlanIndexEntry(ydoc: Y.Doc, planId: string): void {
  const entry = getPlanIndexEntry(ydoc, planId);
  if (entry) {
    setPlanIndexEntry(ydoc, { ...entry, updatedAt: Date.now() });
  }
}

/**
 * Gets the viewedBy map for a plan from the plan-index.
 * Returns empty object if no viewedBy data exists.
 */
export function getViewedByFromIndex(ydoc: Y.Doc, planId: string): Record<string, number> {
  const viewedByRoot = ydoc.getMap<Y.Map<number>>(PLAN_INDEX_VIEWED_BY_KEY);
  const planViewedBy = viewedByRoot.get(planId);

  if (!planViewedBy || !(planViewedBy instanceof Y.Map)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [username, timestamp] of planViewedBy.entries()) {
    if (typeof timestamp === 'number') {
      result[username] = timestamp;
    }
  }
  return result;
}

/**
 * Updates viewedBy for a plan in the plan-index.
 * Uses nested Y.Map for proper CRDT merging of concurrent edits.
 */
export function updatePlanIndexViewedBy(ydoc: Y.Doc, planId: string, username: string): void {
  ydoc.transact(() => {
    const viewedByRoot = ydoc.getMap<Y.Map<number>>(PLAN_INDEX_VIEWED_BY_KEY);

    let planViewedBy = viewedByRoot.get(planId);
    if (!planViewedBy || !(planViewedBy instanceof Y.Map)) {
      planViewedBy = new Y.Map<number>();
      viewedByRoot.set(planId, planViewedBy);
    }

    planViewedBy.set(username, Date.now());
  });
}

/**
 * Clears viewedBy for a plan in the plan-index (marks as unread).
 * Removes the user's timestamp, making the plan appear unread again.
 */
export function clearPlanIndexViewedBy(ydoc: Y.Doc, planId: string, username: string): void {
  ydoc.transact(() => {
    const viewedByRoot = ydoc.getMap<Y.Map<number>>(PLAN_INDEX_VIEWED_BY_KEY);
    const planViewedBy = viewedByRoot.get(planId);

    if (planViewedBy && planViewedBy instanceof Y.Map) {
      planViewedBy.delete(username);
    }
  });
}

/**
 * Gets all viewedBy data from the plan-index for multiple plans.
 * Efficient batch read for inbox calculations.
 */
export function getAllViewedByFromIndex(
  ydoc: Y.Doc,
  planIds: string[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const planId of planIds) {
    result[planId] = getViewedByFromIndex(ydoc, planId);
  }

  return result;
}

/**
 * Removes viewedBy data for a plan (call when plan is deleted).
 */
export function removeViewedByFromIndex(ydoc: Y.Doc, planId: string): void {
  const viewedByRoot = ydoc.getMap<Y.Map<number>>(PLAN_INDEX_VIEWED_BY_KEY);
  viewedByRoot.delete(planId);
}

/**
 * Key for event-level read tracking in plan-index.
 * Structure: event-viewedBy[planId][eventId][username] = timestamp
 */
export const PLAN_INDEX_EVENT_VIEWED_BY_KEY = 'event-viewedBy' as const;

/**
 * Mark an event as viewed by a user.
 * CRDT boundary: validates Y.Map instances before use.
 */
export function markEventAsViewed(
  ydoc: Y.Doc,
  planId: string,
  eventId: string,
  username: string
): void {
  /**
   * Wrap all nested map operations in a transaction to prevent observers
   * from firing with intermediate state (e.g., planEvents created but
   * eventViews not yet set).
   */
  ydoc.transact(() => {
    const viewedByRoot = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY);
    const rawPlanEvents = viewedByRoot.get(planId);

    /** Validate CRDT data structure - could be corrupted */
    let planEvents: Y.Map<unknown>;
    if (rawPlanEvents instanceof Y.Map) {
      planEvents = rawPlanEvents;
    } else {
      /** Corrupted or missing - recreate the map */
      planEvents = new Y.Map();
      viewedByRoot.set(planId, planEvents);
    }

    const rawEventViews = planEvents.get(eventId);

    /** Validate nested CRDT data structure */
    let eventViews: Y.Map<unknown>;
    if (rawEventViews instanceof Y.Map) {
      eventViews = rawEventViews;
    } else {
      /** Corrupted or missing - recreate the map */
      eventViews = new Y.Map();
      planEvents.set(eventId, eventViews);
    }

    eventViews.set(username, Date.now());
  });
}

/**
 * Clear event viewed status for a user (mark as unread).
 * CRDT boundary: validates Y.Map instances before use.
 */
export function clearEventViewedBy(
  ydoc: Y.Doc,
  planId: string,
  eventId: string,
  username: string
): void {
  const viewedByRoot = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY);
  const planEvents = viewedByRoot.get(planId);

  /** Validate CRDT data structure */
  if (!planEvents || !(planEvents instanceof Y.Map)) return;

  const eventViews = planEvents.get(eventId);

  /** Validate nested CRDT data structure */
  if (!eventViews || !(eventViews instanceof Y.Map)) return;

  eventViews.delete(username);
}

/**
 * Check if an event is unread for a user.
 * CRDT boundary: validates Y.Map instances before use.
 */
export function isEventUnread(
  ydoc: Y.Doc,
  planId: string,
  eventId: string,
  username: string
): boolean {
  const viewedByRoot = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY);
  const planEvents = viewedByRoot.get(planId);

  /** Validate CRDT data structure */
  if (!planEvents || !(planEvents instanceof Y.Map)) return true;

  const eventViews = planEvents.get(eventId);

  /** Validate nested CRDT data structure */
  if (!eventViews || !(eventViews instanceof Y.Map)) return true;

  return !eventViews.has(username);
}

/**
 * Get all event viewedBy data for a plan.
 * Returns map of eventId -> (username -> timestamp).
 * CRDT boundary: validates Y.Map instances before use.
 */
export function getAllEventViewedByForPlan(
  ydoc: Y.Doc,
  planId: string
): Record<string, Record<string, number>> {
  const viewedByRoot = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY);
  const planEvents = viewedByRoot.get(planId);

  /** Validate CRDT data structure */
  if (!planEvents || !(planEvents instanceof Y.Map)) return {};

  const result: Record<string, Record<string, number>> = {};

  for (const [eventId, eventViews] of planEvents.entries()) {
    /** Validate nested CRDT data structure */
    if (!(eventViews instanceof Y.Map)) continue;

    const views: Record<string, number> = {};
    for (const [username, timestamp] of eventViews.entries()) {
      /** Validate timestamp is a number */
      if (typeof timestamp === 'number') {
        views[username] = timestamp;
      }
    }
    result[eventId] = views;
  }

  return result;
}
