/**
 * Inline detail panel for viewing plans in list views.
 * Used by InboxPage, ArchivePage, and SearchPage for consistent plan viewing.
 */

import { Spinner } from '@heroui/react';
import { getDeliverables, getPlanMetadata, type PlanMetadata, YDOC_KEYS } from '@shipyard/schema';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type * as Y from 'yjs';
import { PlanContent } from '@/components/PlanContent';
import type { PanelWidth } from '@/components/PlanPanel';
import { PlanPanelHeader } from '@/components/PlanPanelHeader';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { colorFromString } from '@/utils/color';
import { formatRelativeTime } from '@/utils/formatters';
import { setSidebarCollapsed } from '@/utils/uiPreferences';

/** Callback context provided to approve/requestChanges handlers */
export interface PlanActionContext {
  planId: string;
  ydoc: Y.Doc;
  metadata: PlanMetadata;
}

export interface InlinePlanDetailProps {
  /** Plan ID to display, null if no plan selected */
  planId: string | null;
  /** Called when panel should close */
  onClose: () => void;
  /** Called when approve action is triggered. Receives plan context. If not provided, navigates to plan page. */
  onApprove?: (context: PlanActionContext) => void;
  /** Called when request changes action is triggered. Receives plan context. If not provided, navigates to plan page. */
  onRequestChanges?: (context: PlanActionContext) => void;
  /** Called when expand button is pressed. If not provided, expand button is hidden. */
  onExpand?: () => void;
  /** Panel width for header display. Defaults to 'peek' for inline panels. */
  width?: PanelWidth;
  /** Message shown when no plan is selected */
  emptyMessage?: string;
}

/**
 * Inline plan detail panel with sync, metadata loading, and content display.
 * Handles all shared logic for viewing plans in a detail panel.
 */
export function InlinePlanDetail({
  planId,
  onClose,
  onApprove,
  onRequestChanges,
  onExpand,
  width = 'peek',
  emptyMessage = 'Select a task to view details',
}: InlinePlanDetailProps) {
  const navigate = useNavigate();
  const { identity: githubIdentity, startAuth } = useGitHubAuth();

  // Plan data for panel
  const [panelMetadata, setPanelMetadata] = useState<PlanMetadata | null>(null);
  const [panelDeliverableStats, setPanelDeliverableStats] = useState({ completed: 0, total: 0 });
  const [panelLastActivity, setPanelLastActivity] = useState('');
  const [loadTimeout, setLoadTimeout] = useState(false);

  // Sync providers for selected plan
  const {
    ydoc: panelYdoc,
    syncState: panelSyncState,
    wsProvider: panelWsProvider,
    rtcProvider: panelRtcProvider,
  } = useMultiProviderSync(planId || '');

  // Timeout for loading state (detect invalid planIds)
  useEffect(() => {
    if (!planId) {
      setLoadTimeout(false);
      return;
    }

    const timer = setTimeout(() => {
      if (!panelMetadata) {
        setLoadTimeout(true);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timer);
  }, [planId, panelMetadata]);

  // Load panel metadata when plan is selected
  useEffect(() => {
    if (!planId || !panelSyncState.idbSynced) {
      setPanelMetadata(null);
      setLoadTimeout(false);
      return;
    }

    const metaMap = panelYdoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);
    const update = () => {
      const metadata = getPlanMetadata(panelYdoc);
      setPanelMetadata(metadata);

      // Update deliverable stats
      const deliverables = getDeliverables(panelYdoc);
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setPanelDeliverableStats({ completed, total: deliverables.length });

      // Format last activity
      if (metadata?.updatedAt) {
        setPanelLastActivity(`Updated ${formatRelativeTime(metadata.updatedAt)}`);
      }
    };
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [planId, panelYdoc, panelSyncState.idbSynced]);

  // Identity for comments
  const identity = githubIdentity
    ? {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      }
    : null;

  const handleRequestIdentity = useCallback(() => {
    startAuth();
  }, [startAuth]);

  // Navigate to full plan page
  const handleFullScreen = useCallback(() => {
    if (planId) {
      setSidebarCollapsed(true);
      navigate(`/plan/${planId}`);
    }
  }, [planId, navigate]);

  // Default approve handler - navigate to plan page
  const handleApprove = useCallback(() => {
    if (onApprove && planId && panelMetadata) {
      onApprove({ planId, ydoc: panelYdoc, metadata: panelMetadata });
    } else if (planId) {
      navigate(`/plan/${planId}`);
    }
  }, [onApprove, planId, panelYdoc, panelMetadata, navigate]);

  // Default request changes handler - navigate to plan page
  const handleRequestChanges = useCallback(() => {
    if (onRequestChanges && planId && panelMetadata) {
      onRequestChanges({ planId, ydoc: panelYdoc, metadata: panelMetadata });
    } else if (planId) {
      navigate(`/plan/${planId}`);
    }
  }, [onRequestChanges, planId, panelYdoc, panelMetadata, navigate]);

  // Prefer WebSocket when connected, fall back to WebRTC
  const activeProvider = panelWsProvider ?? panelRtcProvider;

  // Plan selected and metadata loaded
  if (planId && panelMetadata) {
    return (
      <div className="flex flex-col h-full">
        <PlanPanelHeader
          metadata={panelMetadata}
          deliverableStats={panelDeliverableStats}
          lastActivityText={panelLastActivity}
          onApprove={handleApprove}
          onRequestChanges={handleRequestChanges}
          onClose={onClose}
          onExpand={onExpand}
          onFullScreen={handleFullScreen}
          width={width}
        />
        <div className="flex-1 overflow-y-auto">
          <PlanContent
            mode="live"
            ydoc={panelYdoc}
            metadata={panelMetadata}
            syncState={panelSyncState}
            identity={identity}
            onRequestIdentity={handleRequestIdentity}
            provider={activeProvider}
          />
        </div>
      </div>
    );
  }

  // Plan selected but still loading
  if (planId) {
    if (loadTimeout) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-danger mb-2">Task not found</p>
            <p className="text-sm text-muted-foreground">
              This task may have been deleted or is invalid.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-muted-foreground">Loading task...</p>
        </div>
      </div>
    );
  }

  // No plan selected
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <p>{emptyMessage}</p>
    </div>
  );
}
