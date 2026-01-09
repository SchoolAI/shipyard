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
      // Get all plans in one call
      const activePlans = getPlanIndex(ydoc, false);
      const allPlans = getPlanIndex(ydoc, true);
      const archived = allPlans.filter((p) => p.deletedAt);

      // Single state update instead of 3 separate ones
      setAllPlansData({ active: activePlans, archived });
    };

    const debouncedUpdatePlans = () => {
      // Debounce to prevent excessive updates when multiple Y.Doc changes happen rapidly
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(updatePlans, 100);
    };

    // Initial update without debounce
    updatePlans();

    // Subsequent updates with debouncing
    plansMap.observeDeep(debouncedUpdatePlans);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      plansMap.unobserveDeep(debouncedUpdatePlans);
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
