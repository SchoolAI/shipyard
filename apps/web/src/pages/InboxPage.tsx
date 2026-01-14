/**
 * Inbox Page - Shows plans needing review (pending_review or changes_requested).
 * Includes search filtering and slide-out panel for viewing plans.
 */

import { Button, Chip, ListBox, ListBoxItem, SearchField, Spinner, Tooltip } from '@heroui/react';
import {
  getDeliverables,
  getPlanIndexEntry,
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type PlanIndexEntry,
  type PlanMetadata,
  type PlanStatusType,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import { AlertTriangle, Check, Clock, ExternalLink, MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { PlanContent } from '@/components/PlanContent';
import { type PanelWidth, PlanPanel } from '@/components/PlanPanel';
import { PlanPanelHeader } from '@/components/PlanPanelHeader';
import { InboxSkeleton } from '@/components/ui/InboxSkeleton';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { colorFromString } from '@/utils/color';
import { formatRelativeTime } from '@/utils/formatters';
import { setSidebarCollapsed } from '@/utils/uiPreferences';

interface StatusBadgeProps {
  status: PlanStatusType;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<
    PlanStatusType,
    {
      label: string;
      color: 'warning' | 'danger' | 'success' | 'default' | 'accent';
      icon: React.ReactNode;
    }
  > = {
    pending_review: {
      label: 'Pending Review',
      color: 'warning',
      icon: <Clock className="w-3 h-3" />,
    },
    changes_requested: {
      label: 'Changes Requested',
      color: 'danger',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
    draft: { label: 'Draft', color: 'default', icon: null },
    in_progress: { label: 'In Progress', color: 'accent', icon: null },
    completed: { label: 'Completed', color: 'success', icon: <Check className="w-3 h-3" /> },
  };

  const { label, color, icon } = config[status];

  return (
    <Chip size="sm" variant="soft" color={color} className="gap-1">
      {icon}
      {label}
    </Chip>
  );
}

interface InboxItemProps {
  plan: PlanIndexEntry;
  onApprove: (planId: string) => void;
  onRequestChanges: (planId: string) => void;
  onViewPlan: (planId: string) => void;
}

function InboxItem({ plan, onApprove, onRequestChanges, onViewPlan }: InboxItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{plan.title}</span>
        <div className="flex items-center gap-2">
          <StatusBadge status={plan.status} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(plan.updatedAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Approve plan"
              onPress={() => {
                onApprove(plan.id);
              }}
              className="w-8 h-8"
            >
              <Check className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Approve</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Request changes"
              onPress={() => {
                onRequestChanges(plan.id);
              }}
              className="w-8 h-8"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Request Changes</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="View plan"
              onPress={() => onViewPlan(plan.id)}
              className="w-8 h-8"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>View Plan</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

export function InboxPage() {
  const { identity: githubIdentity, startAuth } = useGitHubAuth();
  const { inboxPlans, markPlanAsRead, isLoading } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  // Slide-out panel state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const rawWidth = searchParams.get('width');
  const validWidths: PanelWidth[] = ['peek', 'expanded', 'full'];
  const initialWidth: PanelWidth = validWidths.includes(rawWidth as PanelWidth)
    ? (rawWidth as PanelWidth)
    : 'peek';

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);
  const [panelWidth, setPanelWidth] = useState<PanelWidth>(initialWidth);

  // Plan data for panel
  const [panelMetadata, setPanelMetadata] = useState<PlanMetadata | null>(null);
  const [panelDeliverableStats, setPanelDeliverableStats] = useState({ completed: 0, total: 0 });
  const [panelLastActivity, setPanelLastActivity] = useState('');

  // Sync providers for selected plan
  const {
    ydoc: panelYdoc,
    syncState: panelSyncState,
    wsProvider: panelWsProvider,
    rtcProvider: panelRtcProvider,
  } = useMultiProviderSync(selectedPlanId || '');

  const sortedInboxPlans = useMemo(() => {
    const sorted = [...inboxPlans].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!searchQuery.trim()) {
      return sorted;
    }
    const query = searchQuery.toLowerCase();
    return sorted.filter((plan) => plan.title.toLowerCase().includes(query));
  }, [inboxPlans, searchQuery]);

  // Update URL when panel state changes
  useEffect(() => {
    if (selectedPlanId) {
      navigate(`?panel=${selectedPlanId}&width=${panelWidth}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
  }, [selectedPlanId, panelWidth, navigate]);

  // Load panel metadata when plan is selected
  useEffect(() => {
    if (!selectedPlanId || !panelSyncState.idbSynced) {
      setPanelMetadata(null);
      return;
    }

    const metaMap = panelYdoc.getMap('metadata');
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
  }, [selectedPlanId, panelYdoc, panelSyncState.idbSynced]);

  // Panel handlers
  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  const handleChangeWidth = useCallback((width: PanelWidth) => {
    setPanelWidth(width);
  }, []);

  // Panel width cycling
  const cycleWidth = useCallback(
    (direction: 'expand' | 'collapse') => {
      const widths: PanelWidth[] = ['peek', 'expanded', 'full'];
      const currentIndex = widths.indexOf(panelWidth);
      if (direction === 'expand' && currentIndex < widths.length - 1) {
        setPanelWidth(widths[currentIndex + 1] as PanelWidth);
      } else if (direction === 'collapse' && currentIndex > 0) {
        setPanelWidth(widths[currentIndex - 1] as PanelWidth);
      }
    },
    [panelWidth]
  );

  // Keyboard shortcuts for panel
  useKeyboardShortcuts({
    onTogglePanel: useCallback(() => {
      if (selectedPlanId) {
        cycleWidth('collapse');
      }
    }, [selectedPlanId, cycleWidth]),
    onExpandPanel: useCallback(() => {
      if (selectedPlanId) {
        cycleWidth('expand');
      }
    }, [selectedPlanId, cycleWidth]),
    onFullScreen: useCallback(() => {
      if (selectedPlanId) {
        setSidebarCollapsed(true);
        navigate(`/plan/${selectedPlanId}`);
      }
    }, [selectedPlanId, navigate]),
    onClose: handleClosePanel,
    onNextItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = sortedInboxPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex < sortedInboxPlans.length - 1) {
        const nextPlan = sortedInboxPlans[currentIndex + 1];
        if (nextPlan) {
          setSelectedPlanId(nextPlan.id);
          markPlanAsRead(nextPlan.id);
        }
      }
    }, [selectedPlanId, sortedInboxPlans, markPlanAsRead]),
    onPrevItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = sortedInboxPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex > 0) {
        const prevPlan = sortedInboxPlans[currentIndex - 1];
        if (prevPlan) {
          setSelectedPlanId(prevPlan.id);
          markPlanAsRead(prevPlan.id);
        }
      }
    }, [selectedPlanId, sortedInboxPlans, markPlanAsRead]),
  });

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

  if (isLoading) {
    return <InboxSkeleton />;
  }

  const handleApprove = async (planId: string) => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const now = Date.now();

    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        status: 'in_progress',
        updatedAt: now,
      });
    }

    try {
      const planDoc = new Y.Doc();
      const idb = new IndexeddbPersistence(planId, planDoc);
      await idb.whenSynced;

      planDoc.transact(() => {
        const metadata = planDoc.getMap('metadata');
        metadata.set('status', 'in_progress');
        metadata.set('updatedAt', now);
      });

      idb.destroy();
    } catch {
      // Plan doc may not exist locally
    }

    toast.success('Plan approved');
  };

  const handleRequestChanges = (planId: string) => {
    markPlanAsRead(planId);
    setSelectedPlanId(planId);
    setPanelWidth('expanded');
    toast.info('Open panel to add comments and request changes');
  };

  const handleViewPlan = (planId: string) => {
    markPlanAsRead(planId);
    setSelectedPlanId(planId);
    setPanelWidth('peek');
  };

  const handleListSelection = (keys: Set<unknown> | 'all') => {
    if (keys === 'all') return;
    const key = Array.from(keys)[0];
    if (key) {
      markPlanAsRead(String(key));
      setSelectedPlanId(String(key));
      setPanelWidth('peek');
    }
  };

  // Panel approve handler
  const handlePanelApprove = async () => {
    if (!selectedPlanId || !panelMetadata) return;

    const now = Date.now();

    panelYdoc.transact(() => {
      const metadata = panelYdoc.getMap('metadata');
      metadata.set('status', 'in_progress');
      metadata.set('updatedAt', now);
    });

    // Also update index with the same timestamp
    const entry = getPlanIndexEntry(indexDoc, selectedPlanId);
    if (entry) {
      setPlanIndexEntry(indexDoc, {
        ...entry,
        status: 'in_progress',
        updatedAt: now,
      });
    }

    toast.success('Plan approved');
  };

  const handlePanelRequestChanges = () => {
    if (!selectedPlanId) return;
    // Navigate to full plan page for adding comments
    navigate(`/plan/${selectedPlanId}`);
    toast.info('Navigate to add comments and request changes');
  };

  // Prefer WebSocket when connected, fall back to WebRTC
  const activeProvider = panelWsProvider ?? panelRtcProvider;

  if (inboxPlans.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Inbox Zero!</h1>
          <p className="text-sm text-muted-foreground">No plans need your review right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {sortedInboxPlans.length}{' '}
              {sortedInboxPlans.length === 1 ? 'plan needs' : 'plans need'} your review
              {searchQuery && inboxPlans.length !== sortedInboxPlans.length && (
                <span className="text-muted-foreground"> (filtered from {inboxPlans.length})</span>
              )}
            </p>
          </div>
        </div>

        <SearchField
          aria-label="Search inbox"
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search inbox..." className="w-full" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedInboxPlans.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-muted-foreground">No plans match "{searchQuery}"</p>
              <Button variant="ghost" size="sm" onPress={() => setSearchQuery('')} className="mt-2">
                Clear search
              </Button>
            </div>
          </div>
        ) : (
          <ListBox
            aria-label="Inbox plans"
            selectionMode="single"
            onSelectionChange={handleListSelection}
            className="divide-y divide-separator"
          >
            {sortedInboxPlans.map((plan) => (
              <ListBoxItem
                id={plan.id}
                key={plan.id}
                textValue={plan.title}
                className="px-3 rounded-lg hover:bg-surface"
              >
                <InboxItem
                  plan={plan}
                  onApprove={handleApprove}
                  onRequestChanges={handleRequestChanges}
                  onViewPlan={handleViewPlan}
                />
              </ListBoxItem>
            ))}
          </ListBox>
        )}
      </div>

      {/* Slide-out panel */}
      <PlanPanel
        planId={selectedPlanId}
        width={panelWidth}
        onClose={handleClosePanel}
        onChangeWidth={handleChangeWidth}
      >
        {selectedPlanId && panelMetadata ? (
          <>
            <PlanPanelHeader
              metadata={panelMetadata}
              deliverableStats={panelDeliverableStats}
              lastActivityText={panelLastActivity}
              onApprove={handlePanelApprove}
              onRequestChanges={handlePanelRequestChanges}
              onClose={handleClosePanel}
              onExpand={() => cycleWidth(panelWidth === 'peek' ? 'expand' : 'collapse')}
              onFullScreen={() => {
                if (selectedPlanId) {
                  setSidebarCollapsed(true);
                  navigate(`/plan/${selectedPlanId}`);
                }
              }}
              width={panelWidth}
            />
            <PlanContent
              ydoc={panelYdoc}
              metadata={panelMetadata}
              syncState={panelSyncState}
              identity={identity}
              onRequestIdentity={handleRequestIdentity}
              provider={activeProvider}
            />
          </>
        ) : selectedPlanId ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <Spinner size="lg" />
              <p className="text-muted-foreground">Loading plan...</p>
            </div>
          </div>
        ) : null}
      </PlanPanel>
    </div>
  );
}
