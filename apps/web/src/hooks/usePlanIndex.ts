import {
  clearPlanIndexViewedBy,
  getAllViewedByFromIndex,
  getPlanIndex,
  getPlanMetadata,
  getPlanOwnerId,
  isPlanUnread,
  NON_PLAN_DB_NAMES,
  PLAN_INDEX_DOC_NAME,
  PLAN_INDEX_VIEWED_BY_KEY,
  type PlanIndexEntry,
  updatePlanIndexViewedBy,
  YDOC_KEYS,
} from '@shipyard/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { useMultiProviderSync } from './useMultiProviderSync';

/** Type alias for viewedBy records: planId -> (username -> timestamp) */
type ViewedByRecord = Record<string, Record<string, number>>;

/**
 * Merge existing viewedBy timestamps with new data, keeping newer timestamps.
 * @param existingViewedBy - Existing viewedBy timestamps for a single plan
 * @param newViewedBy - New viewedBy timestamps for a single plan
 * @returns Merged viewedBy record with newer timestamps preserved
 */
function mergeViewedByTimestamps(
  existingViewedBy: Record<string, number>,
  newViewedBy: Record<string, number>
): Record<string, number> {
  const merged = { ...newViewedBy };
  for (const [username, timestamp] of Object.entries(existingViewedBy)) {
    if (!merged[username] || timestamp > merged[username]) {
      merged[username] = timestamp;
    }
  }
  return merged;
}

/**
 * Merge new viewedBy data with existing state, preserving optimistic updates.
 * For each plan, keeps the newer timestamp for each user.
 * @param prevState - Previous viewedBy state
 * @param newData - New viewedBy data from IndexedDB
 * @returns Merged viewedBy record
 */
function mergeViewedByState(prevState: ViewedByRecord, newData: ViewedByRecord): ViewedByRecord {
  const merged = { ...newData };

  for (const [planId, existingViewedBy] of Object.entries(prevState)) {
    if (!merged[planId]) {
      // Plan not in new data, preserve existing
      merged[planId] = existingViewedBy;
    } else {
      // Merge timestamps for this plan, keeping newer values
      merged[planId] = mergeViewedByTimestamps(existingViewedBy, merged[planId]);
    }
  }

  return merged;
}

/** Extended plan entry with unread status */
export type PlanIndexEntryWithReadState = PlanIndexEntry & {
  /** True if the plan is unread by the current user */
  isUnread?: boolean;
};

export interface PlanIndexState {
  /** Plans owned by the current user */
  myPlans: PlanIndexEntry[];
  /** Plans owned by others (shared with me) */
  sharedPlans: PlanIndexEntry[];
  /** Plans needing attention (pending_review, changes_requested) AND unread */
  inboxPlans: PlanIndexEntryWithReadState[];
  /** All plans matching inbox criteria, including both read and unread */
  allInboxPlans: PlanIndexEntryWithReadState[];
  archivedPlans: PlanIndexEntry[];
  /** Connected to hub WebSocket or WebRTC peers */
  connected: boolean;
  /** Hub WebSocket has completed initial sync */
  synced: boolean;
  /** Number of peers connected via WebRTC P2P */
  peerCount: number;
  /** Whether connection timeout has been reached */
  timedOut: boolean;
  /** Error message if connection failed or timed out */
  error?: string;
  navigationTarget: string | null;
  clearNavigation: () => void;
  /** True while IndexedDB is loading local data */
  isLoading: boolean;
  /** Mark a plan as read by the current user (updates viewedBy in plan's Y.Doc) */
  markPlanAsRead: (planId: string) => Promise<void>;
  /** Mark a plan as unread by the current user (clears viewedBy in plan's Y.Doc) */
  markPlanAsUnread: (planId: string) => Promise<void>;
  /** Force refresh of inbox unread states */
  refreshInboxUnreadState: () => void;
}

/**
 * Hook for syncing with the plan index Y.Doc.
 * Connects to all discovered MCP servers and merges their updates.
 * Returns plans categorized by ownership and connection status.
 *
 * @param currentUsername - GitHub username of the current user (for ownership filtering)
 */
export function usePlanIndex(currentUsername: string | undefined): PlanIndexState {
  const { ydoc, syncState } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const [allPlansData, setAllPlansData] = useState<{
    active: PlanIndexEntry[];
    archived: PlanIndexEntry[];
  }>({ active: [], archived: [] });

  const [discoveredPlans, setDiscoveredPlans] = useState<PlanIndexEntry[]>([]);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const lastDiscoveryKeyRef = useRef<string>('');

  // Per-plan viewedBy data for inbox unread filtering
  const [planViewedBy, setPlanViewedBy] = useState<Record<string, Record<string, number>>>({});
  const [inboxRefreshTrigger, setInboxRefreshTrigger] = useState(0);

  // Track last update to avoid redundant state changes
  // Include updatedAt values so sorting works when timestamps change
  const lastPlanKeysRef = useRef<{ active: string; archived: string }>({
    active: '',
    archived: '',
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncState.idbSynced is intentionally included to re-read plans when IndexedDB finishes loading
  useEffect(() => {
    const plansMap = ydoc.getMap<PlanIndexEntry>(YDOC_KEYS.PLANS);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    const updatePlans = () => {
      if (!isActive) return;

      const activePlans = getPlanIndex(ydoc, false);
      const allPlans = getPlanIndex(ydoc, true);
      const archived = allPlans.filter((p) => p.deleted);

      // Build key strings for comparison - include updatedAt so sorting triggers when timestamps change
      const activeKeys = activePlans
        .map((p) => `${p.id}:${p.updatedAt}:${p.status}`)
        .sort()
        .join(',');
      const archivedKeys = archived
        .map((p) => `${p.id}:${p.updatedAt}:${p.status}`)
        .sort()
        .join(',');

      // Skip update if nothing changed (using ref to avoid closure issues)
      if (
        activeKeys === lastPlanKeysRef.current.active &&
        archivedKeys === lastPlanKeysRef.current.archived
      ) {
        return;
      }

      // Update ref before state to prevent race conditions
      lastPlanKeysRef.current = { active: activeKeys, archived: archivedKeys };
      setAllPlansData({ active: activePlans, archived });
    };

    const debouncedUpdatePlans = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      // Reduced debounce from 100ms to 16ms (one frame) for snappier updates
      debounceTimer = setTimeout(updatePlans, 16);
    };

    // Initial update - run immediately without debounce
    updatePlans();

    // Use observeDeep to detect nested field changes (e.g., updatedAt timestamp changes)
    // so that "Recently Updated" sorting works correctly when plans are modified.
    plansMap.observeDeep(debouncedUpdatePlans);

    return () => {
      isActive = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      plansMap.unobserveDeep(debouncedUpdatePlans);
    };
  }, [ydoc, syncState.idbSynced]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    async function discoverIndexedDBPlans() {
      try {
        const databases = await indexedDB.databases();
        if (!isActive) return;

        const dbNames = databases.map((db) => db.name).filter((name): name is string => !!name);
        const planIndexIds = new Set(allPlansData.active.map((p) => p.id));

        const planDocIds = dbNames.filter(
          (name) =>
            !(NON_PLAN_DB_NAMES as readonly string[]).includes(name) && !planIndexIds.has(name)
        );

        const plans = await Promise.all(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Plan discovery from IndexedDB requires async iteration with filtering
          planDocIds.map(async (id) => {
            try {
              const planDoc = new Y.Doc();
              const idb = new IndexeddbPersistence(id, planDoc);
              await idb.whenSynced;

              if (!isActive) {
                idb.destroy();
                return null;
              }

              const metadata = getPlanMetadata(planDoc);
              const ownerId = getPlanOwnerId(planDoc);
              idb.destroy();

              if (!metadata || !ownerId) {
                return null;
              }

              if (metadata.archivedAt) {
                return null;
              }

              return {
                id: metadata.id,
                title: metadata.title,
                status: metadata.status,
                createdAt: metadata.createdAt ?? Date.now(),
                updatedAt: metadata.updatedAt ?? Date.now(),
                ownerId,
                deleted: false,
              };
            } catch {
              return null;
            }
          })
        );

        if (!isActive) return;

        const validPlans = plans.filter((p): p is PlanIndexEntry => p !== null);
        setDiscoveredPlans(validPlans);
      } catch {
        if (isActive) {
          setDiscoveredPlans([]);
        }
      }
    }

    const discoveryKey = `${allPlansData.active
      .map((p) => p.id)
      .sort()
      .join(',')}|${currentUsername ?? ''}`;
    if (lastDiscoveryKeyRef.current !== discoveryKey) {
      lastDiscoveryKeyRef.current = discoveryKey;
      discoverIndexedDBPlans();
    }

    const handlePlanSynced = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      // Reduced from 500ms to 100ms for faster discovery of new plans
      debounceTimer = setTimeout(() => {
        discoverIndexedDBPlans();
      }, 100);
    };

    window.addEventListener('indexeddb-plan-synced', handlePlanSynced);
    return () => {
      isActive = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener('indexeddb-plan-synced', handlePlanSynced);
    };
  }, [allPlansData.active, currentUsername]);

  const allActivePlans = useMemo(
    () => [...allPlansData.active, ...discoveredPlans],
    [allPlansData.active, discoveredPlans]
  );

  // Get all plans that match inbox criteria (status-based)
  // Inbox shows only plans waiting for review/approval:
  // - pending_review: Plans waiting for your review/approval
  // Note: changes_requested plans belong in "My Plans" (work continues there)
  // Draft plans belong in "My Plans" section, not inbox (they're not actionable yet)
  // in_progress plans also belong in "My Plans" (work continues there)
  const inboxCandidates = useMemo(
    () =>
      allActivePlans.filter((p) => p.ownerId === currentUsername && p.status === 'pending_review'),
    [allActivePlans, currentUsername]
  );

  // Load viewedBy from plan-index (syncs across devices via WebSocket + WebRTC)
  // biome-ignore lint/correctness/useExhaustiveDependencies: inboxRefreshTrigger forces refresh
  useEffect(() => {
    let isActive = true;

    function loadViewedByFromPlanIndex() {
      if (!currentUsername) {
        return; // Don't clear state - just skip loading
      }

      if (inboxCandidates.length === 0) {
        return; // Don't clear state for empty candidates
      }

      const planIds = inboxCandidates.map((p) => p.id);
      const viewedByData = getAllViewedByFromIndex(ydoc, planIds);

      if (isActive) {
        setPlanViewedBy((prev) => mergeViewedByState(prev, viewedByData));
      }
    }

    loadViewedByFromPlanIndex();

    const viewedByRoot = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY);
    const handleViewedByChange = () => {
      if (isActive) {
        loadViewedByFromPlanIndex();
      }
    };
    viewedByRoot.observeDeep(handleViewedByChange);

    return () => {
      isActive = false;
      viewedByRoot.unobserveDeep(handleViewedByChange);
    };
  }, [ydoc, inboxCandidates, currentUsername, inboxRefreshTrigger]);

  // All inbox plans with read state (unfiltered)
  const allInboxPlans: PlanIndexEntryWithReadState[] = useMemo(() => {
    if (!currentUsername) {
      return [];
    }

    return inboxCandidates.map((plan) => {
      const viewedBy = planViewedBy[plan.id] ?? {};
      const isUnread = isPlanUnread(plan, currentUsername, viewedBy);
      return { ...plan, isUnread };
    });
  }, [inboxCandidates, currentUsername, planViewedBy]);

  // Filter inbox to only unread plans
  const inboxPlans: PlanIndexEntryWithReadState[] = useMemo(() => {
    return allInboxPlans.filter((plan) => plan.isUnread);
  }, [allInboxPlans]);

  const myPlans = useMemo(
    () =>
      allActivePlans.filter(
        (p) =>
          p.ownerId === currentUsername &&
          p.status !== 'changes_requested' &&
          p.status !== 'pending_review'
      ),
    [allActivePlans, currentUsername]
  );

  const sharedPlans = useMemo(
    () => allActivePlans.filter((p) => p.ownerId !== currentUsername),
    [allActivePlans, currentUsername]
  );

  const archivedPlans = useMemo(() => allPlansData.archived, [allPlansData.archived]);

  useEffect(() => {
    const navMap = ydoc.getMap<string>('navigation');
    const updateNav = () => {
      const target = navMap.get('target');
      if (target) {
        setNavigationTarget(target);
      }
    };

    updateNav();
    navMap.observe(updateNav);

    return () => {
      navMap.unobserve(updateNav);
    };
  }, [ydoc]);

  const clearNavigation = () => {
    const navMap = ydoc.getMap<string>('navigation');
    navMap.delete('target');
    setNavigationTarget(null);
  };

  // Loading until WebSocket has synced - ensures plans are fetched and filtered
  // before showing content or empty state (prevents flicker)
  // However, if connection has timed out and we have IndexedDB data, show cached data
  const isLoading = !syncState.synced && !syncState.timedOut;

  const markPlanAsRead = useCallback(
    (planId: string): Promise<void> => {
      if (!currentUsername) {
        return Promise.resolve();
      }

      updatePlanIndexViewedBy(ydoc, planId, currentUsername);

      const now = Date.now();
      setPlanViewedBy((prev) => ({
        ...prev,
        [planId]: {
          ...(prev[planId] ?? {}),
          [currentUsername]: now,
        },
      }));

      return Promise.resolve();
    },
    [currentUsername, ydoc]
  );

  const markPlanAsUnread = useCallback(
    (planId: string): Promise<void> => {
      if (!currentUsername) {
        return Promise.resolve();
      }

      clearPlanIndexViewedBy(ydoc, planId, currentUsername);

      // Optimistically update state - remove user's timestamp
      setPlanViewedBy((prev) => {
        const updated = { ...prev };
        if (updated[planId]) {
          const planViewedBy = { ...updated[planId] };
          delete planViewedBy[currentUsername];

          if (Object.keys(planViewedBy).length === 0) {
            delete updated[planId];
          } else {
            updated[planId] = planViewedBy;
          }
        }
        return updated;
      });

      return Promise.resolve();
    },
    [currentUsername, ydoc]
  );

  const refreshInboxUnreadState = useCallback(() => {
    setInboxRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    myPlans,
    sharedPlans,
    inboxPlans,
    allInboxPlans,
    archivedPlans,
    connected: syncState.connected,
    synced: syncState.synced,
    peerCount: syncState.peerCount,
    timedOut: syncState.timedOut,
    error: syncState.error,
    navigationTarget,
    clearNavigation,
    isLoading,
    markPlanAsRead,
    markPlanAsUnread,
    refreshInboxUnreadState,
  };
}
