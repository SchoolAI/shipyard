/**
 * Hook to load inbox-worthy events from all plans.
 * Combines status-based inbox items with event-based notifications.
 */

import {
  getPlanEvents,
  isInboxWorthy,
  type PlanEvent,
  type PlanIndexEntry,
} from '@shipyard/schema';
import { useEffect, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

export interface InboxEventItem {
  /** Plan this event belongs to */
  plan: PlanIndexEntry;
  /** The inbox-worthy event */
  event: PlanEvent;
  /** Event timestamp (for sorting) */
  timestamp: number;
}

// Cache to avoid reloading the same plan events
const eventsCache = new Map<string, { events: PlanEvent[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Load events from a single plan's Y.Doc via IndexedDB.
 * Results are cached for 30 seconds to avoid repeated loads.
 */
async function loadPlanEvents(planId: string): Promise<PlanEvent[]> {
  // Check cache first
  const cached = eventsCache.get(planId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.events;
  }

  try {
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    const events = getPlanEvents(planDoc);

    idb.destroy();

    // Cache the result
    eventsCache.set(planId, { events, timestamp: Date.now() });

    return events;
  } catch {
    // Return empty array on error
    return [];
  }
}

/**
 * Hook to load inbox-worthy events from multiple plans.
 * Filters events by inboxWorthy flag and inboxFor field.
 *
 * @param plans - List of plans to check for inbox events
 * @param currentUsername - GitHub username to filter events for
 * @returns List of inbox event items, sorted by timestamp descending
 */
export function useInboxEvents(
  plans: PlanIndexEntry[],
  currentUsername: string | null
): InboxEventItem[] {
  const [inboxEvents, setInboxEvents] = useState<InboxEventItem[]>([]);

  useEffect(() => {
    if (!currentUsername || plans.length === 0) {
      setInboxEvents([]);
      return;
    }

    let isActive = true;

    async function loadAllEvents() {
      const allEvents: InboxEventItem[] = [];

      // Load events from each plan in parallel
      const eventPromises = plans.map(async (plan) => {
        const events = await loadPlanEvents(plan.id);

        // Filter for inbox-worthy events for this user
        // currentUsername is guaranteed non-null by the outer condition
        // Pass plan.ownerId to resolve 'owner' in inboxFor field
        const inboxWorthyEvents = events.filter((event) => {
          if (!currentUsername) return false;
          return isInboxWorthy(event, currentUsername, plan.ownerId);
        });

        // Map to InboxEventItem
        return inboxWorthyEvents.map((event) => ({
          plan,
          event,
          timestamp: event.timestamp,
        }));
      });

      const results = await Promise.all(eventPromises);

      // Flatten and sort by timestamp descending
      for (const items of results) {
        allEvents.push(...items);
      }

      allEvents.sort((a, b) => b.timestamp - a.timestamp);

      if (isActive) {
        setInboxEvents(allEvents);
      }
    }

    loadAllEvents();

    return () => {
      isActive = false;
    };
  }, [plans, currentUsername]);

  return inboxEvents;
}

/**
 * Invalidate cache for a specific plan's events.
 * Call this when a plan's events are updated.
 */
export function invalidateInboxEventsCache(planId: string): void {
  eventsCache.delete(planId);
}

/**
 * Clear the entire inbox events cache.
 */
export function clearInboxEventsCache(): void {
  eventsCache.clear();
}
