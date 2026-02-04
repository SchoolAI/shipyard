/**
 * Hook to manage panel data and review actions for the Kanban board.
 * Handles loading metadata for selected plan and provides review action callbacks.
 */

import {
  getDeliverables,
  getPlanIndexEntry,
  getPlanMetadata,
  type PlanMetadata,
  setPlanIndexEntry,
  transitionPlanStatus,
  YDOC_KEYS,
} from '@shipyard/schema';
import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import type { SyncState } from '@/hooks/useMultiProviderSync';
import { formatRelativeTime } from '@/utils/formatters';

/** Deliverable completion statistics */
export interface DeliverableStats {
  completed: number;
  total: number;
}

/** Return type for the useKanbanPanelData hook */
export interface UseKanbanPanelDataReturn {
  /** Metadata for the selected plan */
  panelMetadata: PlanMetadata | null;
  /** Deliverable completion stats */
  panelDeliverableStats: DeliverableStats;
  /** Last activity text (e.g., "Updated 2 hours ago") */
  panelLastActivity: string;
  /** Handle approve action */
  handleApprove: () => Promise<void>;
  /** Handle request changes action */
  handleRequestChanges: () => void;
}

/**
 * Hook for loading panel data and providing review actions.
 *
 * @param selectedPlanId - Currently selected plan ID
 * @param panelYdoc - Y.Doc for the selected plan
 * @param panelSyncState - Sync state for the panel
 * @param indexDoc - Plan index Y.Doc
 * @param githubIdentity - GitHub identity for attributing actions
 * @param navigate - React Router navigate function
 * @param getPlanRoute - Function to get plan route
 */
export function useKanbanPanelData(
  selectedPlanId: string | null,
  panelYdoc: Y.Doc,
  panelSyncState: SyncState,
  indexDoc: Y.Doc,
  githubIdentity: GitHubIdentity | null,
  navigate: NavigateFunction,
  getPlanRoute: (planId: string) => string
): UseKanbanPanelDataReturn {
  const [panelMetadata, setPanelMetadata] = useState<PlanMetadata | null>(null);
  const [panelDeliverableStats, setPanelDeliverableStats] = useState<DeliverableStats>({
    completed: 0,
    total: 0,
  });
  const [panelLastActivity, setPanelLastActivity] = useState('');

  /** Load panel metadata when plan is selected */
  useEffect(() => {
    if (!selectedPlanId || !panelSyncState.idbSynced) {
      setPanelMetadata(null);
      return;
    }

    const metaMap = panelYdoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);
    const update = () => {
      const metadata = getPlanMetadata(panelYdoc);
      setPanelMetadata(metadata);

      const deliverables = getDeliverables(panelYdoc);
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setPanelDeliverableStats({ completed, total: deliverables.length });

      if (metadata?.updatedAt) {
        setPanelLastActivity(`Updated ${formatRelativeTime(metadata.updatedAt)}`);
      }
    };
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [selectedPlanId, panelYdoc, panelSyncState.idbSynced]);

  /** Handle approve action */
  const handleApprove = useCallback(async () => {
    if (!selectedPlanId || !panelMetadata) return;

    const now = Date.now();
    const reviewedBy = githubIdentity?.displayName || githubIdentity?.username || 'Unknown';

    transitionPlanStatus(
      panelYdoc,
      { status: 'in_progress', reviewedAt: now, reviewedBy },
      reviewedBy
    );

    const entry = getPlanIndexEntry(indexDoc, selectedPlanId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        status: 'in_progress',
        updatedAt: now,
      });
    }

    toast.success('Task approved');
  }, [selectedPlanId, panelMetadata, panelYdoc, indexDoc, githubIdentity]);

  /** Handle request changes action */
  const handleRequestChanges = useCallback(() => {
    if (!selectedPlanId) return;
    navigate(getPlanRoute(selectedPlanId));
    toast.info('Navigate to add comments and request changes');
  }, [selectedPlanId, navigate, getPlanRoute]);

  return {
    panelMetadata,
    panelDeliverableStats,
    panelLastActivity,
    handleApprove,
    handleRequestChanges,
  };
}
