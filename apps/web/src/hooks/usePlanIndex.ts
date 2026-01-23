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
import { isSyncStateTimedOut, useMultiProviderSync } from './useMultiProviderSync';

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

/**
 * Load a single plan from IndexedDB and extract its metadata.
 * Returns null if the plan cannot be loaded, has no metadata/owner, or is archived.
 *
 * @param id - The plan document ID (IndexedDB database name)
 * @param isActive - Ref-like object to check if the operation should continue
 * @returns Plan index entry or null if plan should be skipped
 */
async function loadPlanFromIndexedDB(
  id: string,
  isActive: { current: boolean }
): Promise<PlanIndexEntry | null> {
  const planDoc = new Y.Doc();
  const idb = new IndexeddbPersistence(id, planDoc);

  try {
    await idb.whenSynced;

    if (!isActive.current) {
      return null;
    }

    const metadata = getPlanMetadata(planDoc);
    const ownerId = getPlanOwnerId(planDoc);

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
      deleted: false as const,
    };
  } catch {
    return null;
  } finally {
    idb.destroy();
  }
}

export interface PlanIndexState {
  /** Plans owned by the current user */
  myPlans: PlanIndexEntry[];
  /** Plans owned by others (shared with me) */
  sharedPlans: PlanIndexEntry[];
  /** Plans needing attention (pending_review, changes_requested) AND unread */
  inboxPlans: PlanIndexEntryWithReadState[];
  /** All plans matching inbox criteria, including both read and unread */
  allInboxPlans: PlanIndexEntryWithReadState[];
  /** All plans owned by current user regardless of status (for event-based inbox) */
  allOwnedPlans: PlanIndexEntry[];
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
  /** The plan-index Y.Doc for direct access (e.g., useInputRequests) */
  ydoc: Y.Doc;
  /** Manually trigger reconnection after circuit breaker trips */
  reconnect: () => void;
  /** True while reconnection is in progress (prevents button spam) */
  isReconnecting: boolean;
}

/**
 * Hook for syncing with the plan index Y.Doc.
 * Connects to all discovered MCP servers and merges their updates.
 * Returns plans categorized by ownership and connection status.
 *
 * @param currentUsername - GitHub username of the current user (for ownership filtering)
 */
export function usePlanIndex(currentUsername: string | undefined): PlanIndexState {
  const { ydoc, syncState, reconnect, isReconnecting } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  const [allPlansData, setAllPlansData] = useState<{
    active: PlanIndexEntry[];
    archived: PlanIndexEntry[];
  }>({ active: [], archived: [] });

  const [discoveredPlans, setDiscoveredPlans] = useState<PlanIndexEntry[]>([]);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);

  // Per-plan viewedBy data for inbox unread filtering
  const [planViewedBy, setPlanViewedBy] = useState<Record<string, Record<string, number>>>({});
  const [inboxRefreshTrigger, setInboxRefreshTrigger] = useState(0);

  // Track last update to avoid redundant state changes
  // Include updatedAt values so sorting works when timestamps change
  const lastPlanKeysRef = useRef<{ active: string; archived: string }>({
    active: '',
    archived: '',
  });
  const lastDiscoveryKeyRef = useRef<string>('');

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
      // Wrap isActive in an object so it can be passed by reference to async helpers
      const activeRef = { current: isActive };

      try {
        const databases = await indexedDB.databases();
        if (!activeRef.current) return;

        const dbNames = databases.map((db) => db.name).filter((name): name is string => !!name);
        const planIndexIds = new Set(allPlansData.active.map((p) => p.id));

        const planDocIds = dbNames.filter(
          (name) =>
            !(NON_PLAN_DB_NAMES as readonly string[]).includes(name) && !planIndexIds.has(name)
        );

        const plans = await Promise.all(
          planDocIds.map((id) => loadPlanFromIndexedDB(id, activeRef))
        );

        if (!activeRef.current) return;

        const validPlans = plans.filter((p): p is PlanIndexEntry => p !== null);
        setDiscoveredPlans(validPlans);
      } catch {
        if (activeRef.current) {
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
      debounceTimer = setTimeout(() => {
        discoverIndexedDBPlans();
      }, 100);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        discoverIndexedDBPlans();
      }
    };

    window.addEventListener('indexeddb-plan-synced', handlePlanSynced);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActive = false;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener('indexeddb-plan-synced', handlePlanSynced);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [allPlansData.active, currentUsername]);

  /**
   * All active plans, combining plan-index CRDT with IndexedDB discovery.
   * Deduplicates by plan ID (plan-index takes precedence).
   */
  const allActivePlans = useMemo(() => {
    const planMap = new Map<string, PlanIndexEntry>();
    for (const plan of allPlansData.active) {
      planMap.set(plan.id, plan);
    }
    for (const plan of discoveredPlans) {
      if (!planMap.has(plan.id)) {
        planMap.set(plan.id, plan);
      }
    }
    return Array.from(planMap.values());
  }, [allPlansData.active, discoveredPlans]);

  /**
   * Inbox shows all notifications (plans that the user might need to act on).
   * Unlike a status-based view, inbox keeps items until they're marked as read.
   * This includes:
   * - draft: New plans just created
   * - pending_review: Plans waiting for approval
   * - in_progress: Recently approved plans (stay visible until read)
   * - changes_requested: Plans needing revision (stay visible until read)
   * NOTE: Only 'completed' plans are excluded from inbox (they go to archive view)
   */
  const inboxCandidates = useMemo(
    () =>
      allActivePlans.filter(
        (p) =>
          p.ownerId === currentUsername &&
          (p.status === 'pending_review' ||
            p.status === 'draft' ||
            p.status === 'in_progress' ||
            p.status === 'changes_requested')
      ),
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

  // All plans owned by current user (for event-based inbox - includes all statuses)
  const allOwnedPlans = useMemo(
    () => allActivePlans.filter((p) => p.ownerId === currentUsername),
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

  // Loading until we have usable data from ANY source:
  // 1. WebSocket has synced (online with MCP server)
  // 2. Connection has timed out (offline mode)
  // 3. IndexedDB has synced (local cached data available - critical for mobile!)
  //
  // The IndexedDB check fixes infinite loading on mobile where:
  // - No local MCP server means WebSocket never syncs
  // - Timeout should fire but might be unreliable
  // - IndexedDB syncs almost immediately with local data
  const isLoading = !syncState.idbSynced && !syncState.synced && !syncState.timedOut;

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
    allOwnedPlans,
    archivedPlans,
    connected: syncState.connected,
    synced: syncState.synced,
    peerCount: syncState.peerCount,
    timedOut: syncState.timedOut,
    error: isSyncStateTimedOut(syncState) ? syncState.error : undefined,
    navigationTarget,
    clearNavigation,
    isLoading,
    markPlanAsRead,
    markPlanAsUnread,
    refreshInboxUnreadState,
    ydoc,
    reconnect,
    isReconnecting,
  };
}
