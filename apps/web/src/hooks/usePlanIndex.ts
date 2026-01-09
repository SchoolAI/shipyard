import { getPlanIndex, PLAN_INDEX_DOC_NAME, type PlanIndexEntry } from '@peer-plan/schema';
import { useEffect, useMemo, useState } from 'react';
import { useMultiProviderSync } from './useMultiProviderSync';

export interface PlanIndexState {
  plans: PlanIndexEntry[];
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
 * Returns the list of all plans and connection status.
 */
export function usePlanIndex(): PlanIndexState {
  const { ydoc, syncState } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const [allPlansData, setAllPlansData] = useState<{
    active: PlanIndexEntry[];
    archived: PlanIndexEntry[];
  }>({ active: [], archived: [] });
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);

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

  // Derive filtered lists with useMemo to avoid triggering dependent effects
  const inboxPlans = useMemo(
    () =>
      allPlansData.active.filter(
        (p) => p.status === 'changes_requested' || p.status === 'pending_review'
      ),
    [allPlansData.active]
  );

  const plans = useMemo(
    () =>
      allPlansData.active.filter(
        (p) => p.status !== 'changes_requested' && p.status !== 'pending_review'
      ),
    [allPlansData.active]
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
    plans,
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
