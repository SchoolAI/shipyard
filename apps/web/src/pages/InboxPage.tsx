/**
 * Inbox Page - Shows plans needing review (pending_review or changes_requested).
 * Two-column layout with inbox list on left and detail panel on right.
 */

import { Button, Chip, ListBox, ListBoxItem, Switch, Tooltip } from '@heroui/react';
import {
  getPlanIndexEntry,
  PLAN_INDEX_DOC_NAME,
  type PlanIndexEntry,
  type PlanStatusType,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import { AlertTriangle, Check, Clock, MessageSquare, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { InlinePlanDetail, type PlanActionContext } from '@/components/InlinePlanDetail';
import { TwoColumnSkeleton } from '@/components/ui/TwoColumnSkeleton';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
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
  onDismiss: (planId: string) => void;
}

function InboxItem({ plan, onApprove, onRequestChanges, onDismiss }: InboxItemProps) {
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
              aria-label="Dismiss plan"
              onPress={() => onDismiss(plan.id)}
              className="w-8 h-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Dismiss</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

export function InboxPage() {
  // All hooks at top of component - called in same order every render
  const navigate = useNavigate();
  const location = useLocation();
  const { identity: githubIdentity } = useGitHubAuth();
  const { inboxPlans, markPlanAsRead, isLoading } = usePlanIndex(githubIdentity?.username);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const [showRead, setShowRead] = useState(false);

  // Selected plan state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);

  // Note: inboxPlans from usePlanIndex is already filtered to unread only.
  // The "show read" toggle would require usePlanIndex to expose all inbox candidates.
  // For now, this toggle is a placeholder for future implementation.
  const sortedInboxPlans = useMemo(() => {
    return [...inboxPlans].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [inboxPlans]);

  // Update URL when panel state changes
  useEffect(() => {
    if (selectedPlanId) {
      navigate(`?panel=${selectedPlanId}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
  }, [selectedPlanId, navigate]);

  // Panel handlers
  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  // Dismiss handler
  const handleDismiss = useCallback(
    async (planId: string) => {
      await markPlanAsRead(planId);
      toast.success('Marked as read');
    },
    [markPlanAsRead]
  );

  // Helper to find the next plan to select after dismissal
  const getNextSelectedId = useCallback(
    (currentIndex: number): string | null => {
      if (currentIndex < sortedInboxPlans.length - 1) {
        return sortedInboxPlans[currentIndex + 1]?.id ?? null;
      }
      if (currentIndex > 0) {
        return sortedInboxPlans[currentIndex - 1]?.id ?? null;
      }
      return null;
    },
    [sortedInboxPlans]
  );

  // Approve handler
  const handleApprove = useCallback(
    async (planId: string) => {
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
          const reviewRequestId = metadata.get('reviewRequestId') as string | undefined;

          metadata.set('status', 'in_progress');
          metadata.set('updatedAt', now);

          // Preserve reviewRequestId if present (hook needs this to match)
          if (reviewRequestId !== undefined) {
            metadata.set('reviewRequestId', reviewRequestId);
          }
        });

        idb.destroy();
      } catch {
        // Plan doc may not exist locally
      }

      toast.success('Plan approved');
    },
    [githubIdentity, indexDoc]
  );

  // Request changes handler
  const handleRequestChanges = useCallback(
    (planId: string) => {
      markPlanAsRead(planId);
      setSelectedPlanId(planId);
      toast.info('Open panel to add comments and request changes');
    },
    [markPlanAsRead]
  );

  // List selection handler
  const handleListSelection = useCallback(
    (keys: Set<unknown> | 'all') => {
      if (keys === 'all') return;
      const key = Array.from(keys)[0];
      if (key) {
        markPlanAsRead(String(key));
        setSelectedPlanId(String(key));
      }
    },
    [markPlanAsRead]
  );

  // Panel approve handler
  const handlePanelApprove = useCallback(
    async (context: PlanActionContext) => {
      const { planId, ydoc } = context;

      const now = Date.now();

      ydoc.transact(() => {
        const metadata = ydoc.getMap('metadata');
        const reviewRequestId = metadata.get('reviewRequestId') as string | undefined;

        metadata.set('status', 'in_progress');
        metadata.set('updatedAt', now);

        // Preserve reviewRequestId if present (hook needs this to match)
        if (reviewRequestId !== undefined) {
          metadata.set('reviewRequestId', reviewRequestId);
        }
      });

      // Also update index with the same timestamp
      const entry = getPlanIndexEntry(indexDoc, planId);
      if (entry) {
        setPlanIndexEntry(indexDoc, {
          ...entry,
          status: 'in_progress',
          updatedAt: now,
        });
      }

      toast.success('Plan approved');
    },
    [indexDoc]
  );

  // Panel request changes handler
  const handlePanelRequestChanges = useCallback(
    (context: PlanActionContext) => {
      const { planId } = context;
      // Navigate to full plan page for adding comments
      navigate(`/plan/${planId}`);
      toast.info('Navigate to add comments and request changes');
    },
    [navigate]
  );

  // Keyboard shortcut handlers - all extracted to top level
  const handleFullScreen = useCallback(() => {
    if (selectedPlanId) {
      setSidebarCollapsed(true);
      navigate(`/plan/${selectedPlanId}`);
    }
  }, [selectedPlanId, navigate]);

  const handleNextItem = useCallback(() => {
    if (!selectedPlanId) return;
    const currentIndex = sortedInboxPlans.findIndex((p) => p.id === selectedPlanId);
    if (currentIndex < sortedInboxPlans.length - 1) {
      const nextPlan = sortedInboxPlans[currentIndex + 1];
      if (nextPlan) {
        setSelectedPlanId(nextPlan.id);
        markPlanAsRead(nextPlan.id);
      }
    }
  }, [selectedPlanId, sortedInboxPlans, markPlanAsRead]);

  const handlePrevItem = useCallback(() => {
    if (!selectedPlanId) return;
    const currentIndex = sortedInboxPlans.findIndex((p) => p.id === selectedPlanId);
    if (currentIndex > 0) {
      const prevPlan = sortedInboxPlans[currentIndex - 1];
      if (prevPlan) {
        setSelectedPlanId(prevPlan.id);
        markPlanAsRead(prevPlan.id);
      }
    }
  }, [selectedPlanId, sortedInboxPlans, markPlanAsRead]);

  const handleKeyboardDismiss = useCallback(async () => {
    if (!selectedPlanId) return;
    const idx = sortedInboxPlans.findIndex((p) => p.id === selectedPlanId);
    if (idx === -1) return;

    const currentPlan = sortedInboxPlans[idx];
    if (!currentPlan) return;

    await handleDismiss(currentPlan.id);
    setSelectedPlanId(getNextSelectedId(idx));
  }, [selectedPlanId, sortedInboxPlans, handleDismiss, getNextSelectedId]);

  // Keyboard shortcuts for panel
  useKeyboardShortcuts({
    onFullScreen: handleFullScreen,
    onClose: handleClosePanel,
    onNextItem: handleNextItem,
    onPrevItem: handlePrevItem,
    onDismiss: handleKeyboardDismiss,
  });

  if (isLoading) {
    return <TwoColumnSkeleton itemCount={3} showActions={true} titleWidth="w-20" />;
  }

  if (inboxPlans.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Inbox Zero!</h1>
          <p className="text-sm text-muted-foreground">No plans need your attention right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-[minmax(300px,400px)_1fr]">
      {/* Inbox list */}
      <div className="flex flex-col h-full overflow-hidden border-r border-separator">
        {/* Header with show read toggle */}
        <div className="border-b border-separator shrink-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-foreground">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                {sortedInboxPlans.length}{' '}
                {sortedInboxPlans.length === 1 ? 'plan needs' : 'plans need'} your attention
              </p>
            </div>
            <Switch size="sm" isSelected={showRead} onChange={setShowRead}>
              Show read
            </Switch>
          </div>
        </div>

        {/* Inbox results */}
        <div className="flex-1 overflow-y-auto p-2">
          {sortedInboxPlans.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground">No plans in inbox</p>
              </div>
            </div>
          ) : (
            <ListBox
              aria-label="Inbox plans"
              selectionMode="single"
              selectedKeys={selectedPlanId ? new Set([selectedPlanId]) : new Set()}
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
                    onDismiss={handleDismiss}
                  />
                </ListBoxItem>
              ))}
            </ListBox>
          )}
        </div>
      </div>

      {/* Right: Detail panel */}
      <div className="flex flex-col h-full overflow-hidden">
        <InlinePlanDetail
          planId={selectedPlanId}
          onClose={handleClosePanel}
          onApprove={handlePanelApprove}
          onRequestChanges={handlePanelRequestChanges}
          width="expanded"
          emptyMessage="Select a plan to view details"
        />
      </div>
    </div>
  );
}
