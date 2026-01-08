import { getPlanIndex, PLAN_INDEX_DOC_NAME, type PlanIndexEntry } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
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
  const [plans, setPlans] = useState<PlanIndexEntry[]>([]);
  const [inboxPlans, setInboxPlans] = useState<PlanIndexEntry[]>([]);
  const [archivedPlans, setArchivedPlans] = useState<PlanIndexEntry[]>([]);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);

  useEffect(() => {
    const plansMap = ydoc.getMap('plans');
    const updatePlans = () => {
      // Get active plans (default excludes archived)
      const activePlans = getPlanIndex(ydoc, false);

      // Inbox: plans needing attention (changes_requested or pending_review)
      const inbox = activePlans.filter(
        (p) => p.status === 'changes_requested' || p.status === 'pending_review'
      );
      setInboxPlans(inbox);

      // Regular plans: everything else that's active
      const regular = activePlans.filter(
        (p) => p.status !== 'changes_requested' && p.status !== 'pending_review'
      );
      setPlans(regular);

      // Get archived plans separately
      const allPlans = getPlanIndex(ydoc, true);
      setArchivedPlans(allPlans.filter((p) => p.deletedAt));
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
