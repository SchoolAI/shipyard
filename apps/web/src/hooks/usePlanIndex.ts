import {
  getPlanIndex,
  getPlanMetadata,
  getPlanOwnerId,
  NON_PLAN_DB_NAMES,
  PLAN_INDEX_DOC_NAME,
  type PlanIndexEntry,
} from '@peer-plan/schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { useMultiProviderSync } from './useMultiProviderSync';

export interface PlanIndexState {
  /** Plans owned by the current user */
  myPlans: PlanIndexEntry[];
  /** Plans owned by others (shared with me) */
  sharedPlans: PlanIndexEntry[];
  /** Plans needing attention (pending_review, changes_requested) */
  inboxPlans: PlanIndexEntry[];
  archivedPlans: PlanIndexEntry[];
  connected: boolean;
  synced: boolean;
  serverCount: number;
  activeCount: number;
  peerCount: number;
  navigationTarget: string | null;
  clearNavigation: () => void;
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

  useEffect(() => {
    const plansMap = ydoc.getMap('plans');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const updatePlans = () => {
      const activePlans = getPlanIndex(ydoc, false);
      const allPlans = getPlanIndex(ydoc, true);
      const archived = allPlans.filter((p) => p.deletedAt);

      // Only update if plan IDs actually changed to prevent infinite loops
      setAllPlansData((prev) => {
        const activeIds = activePlans
          .map((p) => p.id)
          .sort()
          .join(',');
        const archivedIds = archived
          .map((p) => p.id)
          .sort()
          .join(',');
        const prevActiveIds = prev.active
          .map((p) => p.id)
          .sort()
          .join(',');
        const prevArchivedIds = prev.archived
          .map((p) => p.id)
          .sort()
          .join(',');

        if (activeIds === prevActiveIds && archivedIds === prevArchivedIds) {
          return prev;
        }

        return { active: activePlans, archived };
      });
    };

    const debouncedUpdatePlans = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(updatePlans, 100);
    };

    updatePlans();
    // Use shallow observe instead of observeDeep to avoid firing on nested field changes
    // (e.g., updatedAt timestamp changes). We only care when plans are added/removed.
    plansMap.observe(debouncedUpdatePlans);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      plansMap.unobserve(debouncedUpdatePlans);
    };
  }, [ydoc]);

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
      debounceTimer = setTimeout(() => {
        discoverIndexedDBPlans();
      }, 500);
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

  const inboxPlans = useMemo(
    () =>
      allActivePlans.filter(
        (p) =>
          p.ownerId === currentUsername &&
          (p.status === 'changes_requested' || p.status === 'pending_review')
      ),
    [allActivePlans, currentUsername]
  );

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
  };
}
