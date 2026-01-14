import {
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
} from '@peer-plan/schema';
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
export interface PlanIndexEntryWithReadState extends PlanIndexEntry {
  /** True if the plan is unread by the current user */
  isUnread?: boolean;
}

export interface PlanIndexState {
  /** Plans owned by the current user */
  myPlans: PlanIndexEntry[];
  /** Plans owned by others (shared with me) */
  sharedPlans: PlanIndexEntry[];
  /** Plans needing attention (pending_review, changes_requested) AND unread */
  inboxPlans: PlanIndexEntryWithReadState[];
  archivedPlans: PlanIndexEntry[];
  connected: boolean;
  synced: boolean;
  serverCount: number;
  activeCount: number;
  peerCount: number;
  navigationTarget: string | null;
  clearNavigation: () => void;
  /** True while IndexedDB is loading local data */
  isLoading: boolean;
  /** Mark a plan as read by the current user (updates viewedBy in plan's Y.Doc) */
  markPlanAsRead: (planId: string) => Promise<void>;
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
    const plansMap = ydoc.getMap('plans');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    const updatePlans = () => {
      if (!isActive) return;

      const activePlans = getPlanIndex(ydoc, false);
      const allPlans = getPlanIndex(ydoc, true);
      const archived = allPlans.filter((p) => p.deletedAt);

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
  const inboxCandidates = useMemo(
    () =>
      allActivePlans.filter(
        (p) =>
          p.ownerId === currentUsername &&
          (p.status === 'changes_requested' || p.status === 'pending_review')
      ),
    [allActivePlans, currentUsername]
  );

  // Load viewedBy from plan-index (syncs across devices via WebSocket + WebRTC)
  // biome-ignore lint/correctness/useExhaustiveDependencies: inboxRefreshTrigger forces refresh
  useEffect(() => {
    let isActive = true;

    function loadViewedByFromPlanIndex() {
      if (!currentUsername || inboxCandidates.length === 0) {
        setPlanViewedBy({});
        return;
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

  // Filter inbox to only unread plans
  const inboxPlans: PlanIndexEntryWithReadState[] = useMemo(() => {
    if (!currentUsername) {
      return [];
    }

    const result = inboxCandidates
      .map((plan) => {
        const viewedBy = planViewedBy[plan.id] ?? {};
        const isUnread = isPlanUnread(plan, currentUsername, viewedBy);
        return { ...plan, isUnread };
      })
      .filter((plan) => plan.isUnread);
    return result;
  }, [inboxCandidates, currentUsername, planViewedBy]);

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

  // Loading until IndexedDB has synced - this is when local data becomes available
  const isLoading = !syncState.idbSynced;

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

  /**
   * Force refresh of inbox unread states.
   * Useful after external changes to viewedBy.
   */
  const refreshInboxUnreadState = useCallback(() => {
    setInboxRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    myPlans,
    sharedPlans,
    inboxPlans,
    archivedPlans,
    connected: syncState.connected,
    synced: syncState.synced,
    serverCount: syncState.serverCount,
    activeCount: syncState.activeCount,
    peerCount: syncState.peerCount,
    navigationTarget,
    clearNavigation,
    isLoading,
    markPlanAsRead,
    refreshInboxUnreadState,
  };
}
