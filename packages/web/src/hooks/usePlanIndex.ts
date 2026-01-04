import { getPlanIndex, PLAN_INDEX_DOC_NAME, type PlanIndexEntry } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import { useMultiProviderSync } from './useMultiProviderSync';

export interface PlanIndexState {
  plans: PlanIndexEntry[];
  connected: boolean;
  synced: boolean;
  serverCount: number;
  activeCount: number;
}

/**
 * Hook for syncing with the plan index Y.Doc.
 * Connects to all discovered MCP servers and merges their updates.
 * Returns the list of all plans and connection status.
 */
export function usePlanIndex(): PlanIndexState {
  const { ydoc, syncState } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const [plans, setPlans] = useState<PlanIndexEntry[]>([]);

  useEffect(() => {
    // Listen for index changes
    const plansMap = ydoc.getMap('plans');
    const updatePlans = () => {
      setPlans(getPlanIndex(ydoc));
    };

    // Initial load
    updatePlans();

    // Observe changes
    plansMap.observeDeep(updatePlans);

    return () => {
      plansMap.unobserveDeep(updatePlans);
    };
  }, [ydoc]);

  return {
    plans,
    connected: syncState.connected,
    synced: syncState.synced,
    serverCount: syncState.serverCount,
    activeCount: syncState.activeCount,
  };
}
