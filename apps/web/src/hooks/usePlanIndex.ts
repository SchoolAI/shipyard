import { getPlanIndex, PLAN_INDEX_DOC_NAME, type PlanIndexEntry } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import { useMultiProviderSync } from './useMultiProviderSync';

export interface PlanIndexState {
  plans: PlanIndexEntry[];
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
  const [plans, setPlans] = useState<PlanIndexEntry[]>([]);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);

  useEffect(() => {
    const plansMap = ydoc.getMap('plans');
    const updatePlans = () => {
      setPlans(getPlanIndex(ydoc));
    };

    updatePlans();
    plansMap.observeDeep(updatePlans);

    return () => {
      plansMap.unobserveDeep(updatePlans);
    };
  }, [ydoc]);

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
    connected: syncState.connected,
    synced: syncState.synced,
    serverCount: syncState.serverCount,
    activeCount: syncState.activeCount,
    peerCount: syncState.peerCount,
    navigationTarget,
    clearNavigation,
  };
}
