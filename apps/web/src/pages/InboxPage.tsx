/**
 * Inbox Page - Shows plans needing review (pending_review status only).
 * Two-column layout with inbox list on left and detail panel on right.
 */

import { Accordion, Button, Chip, ListBox, ListBoxItem, Switch, Tooltip } from '@heroui/react';
import {
  getPlanIndexEntry,
  type InputRequest,
  PLAN_INDEX_DOC_NAME,
  type PlanIndexEntry,
  type PlanStatusType,
  setPlanIndexEntry,
  transitionPlanStatus,
} from '@peer-plan/schema';
import {
  AlertOctagon,
  AlertTriangle,
  AtSign,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { InlinePlanDetail, type PlanActionContext } from '@/components/InlinePlanDetail';
import { InputRequestInboxItem } from '@/components/InputRequestInboxItem';
import { InputRequestModal } from '@/components/InputRequestModal';
import { OfflineBanner } from '@/components/OfflineBanner';
import { TagChip } from '@/components/TagChip';
import { TwoColumnSkeleton } from '@/components/ui/TwoColumnSkeleton';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { type InboxEventItem, useInboxEvents } from '@/hooks/useInboxEvents';
import { useInputRequests } from '@/hooks/useInputRequests';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePlanIndex } from '@/hooks/usePlanIndex';
import { formatRelativeTime } from '@/utils/formatters';
import { getInboxShowRead, setInboxShowRead, setSidebarCollapsed } from '@/utils/uiPreferences';

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
  plan: PlanIndexEntry & { isUnread?: boolean };
  onApprove: (planId: string) => void;
  onRequestChanges: (planId: string) => void;
  onDismiss: (planId: string) => void;
  onMarkUnread: (planId: string) => void;
}

function InboxItem({ plan, onApprove, onRequestChanges, onDismiss, onMarkUnread }: InboxItemProps) {
  const isRead = plan.isUnread === false;
  return (
    <div
      className={`flex items-center justify-between gap-3 w-full py-2 ${isRead ? 'opacity-60' : ''}`}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isRead && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" />}
          <span
            className={`font-medium truncate ${isRead ? 'text-muted-foreground' : 'text-foreground'}`}
          >
            {plan.title}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={plan.status} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(plan.updatedAt)}
          </span>
          {/* Show first 3 tags */}
          {plan.tags && plan.tags.length > 0 && (
            <div className="flex gap-1 items-center">
              {plan.tags.slice(0, 3).map((tag) => (
                <TagChip key={tag} tag={tag} size="sm" />
              ))}
              {plan.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{plan.tags.length - 3}</span>
              )}
            </div>
          )}
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
              aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
              onPress={() => (isRead ? onMarkUnread(plan.id) : onDismiss(plan.id))}
              className="w-8 h-8"
            >
              {isRead ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{isRead ? 'Mark as unread' : 'Mark as read'}</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

interface EventInboxItemProps {
  item: InboxEventItem;
  onView: (planId: string) => void;
}

function EventInboxItem({ item, onView }: EventInboxItemProps) {
  const { plan, event } = item;

  // Determine icon and description based on event type
  const getEventDisplay = () => {
    switch (event.type) {
      case 'comment_added':
        if (event.data?.mentions) {
          return {
            icon: <AtSign className="w-4 h-4" />,
            description: `${event.actor} mentioned you`,
            color: 'accent' as const,
          };
        }
        return {
          icon: <MessageSquare className="w-4 h-4" />,
          description: `${event.actor} commented`,
          color: 'default' as const,
        };
      case 'approval_requested':
        return {
          icon: <UserPlus className="w-4 h-4" />,
          description: `${event.actor} requested your approval`,
          color: 'warning' as const,
        };
      case 'deliverable_linked':
        if (event.data?.allFulfilled) {
          return {
            icon: <CheckCircle className="w-4 h-4" />,
            description: 'All deliverables fulfilled',
            color: 'success' as const,
          };
        }
        return {
          icon: <CheckCircle className="w-4 h-4" />,
          description: 'Deliverable linked',
          color: 'default' as const,
        };
      case 'agent_activity':
        if (event.data?.activityType === 'help_request') {
          return {
            icon: <HelpCircle className="w-4 h-4" />,
            description: `needs help: ${event.data.message}`,
            color: 'warning' as const,
          };
        }
        if (event.data?.activityType === 'blocker') {
          return {
            icon: <AlertOctagon className="w-4 h-4" />,
            description: `hit blocker: ${event.data.message}`,
            color: 'danger' as const,
          };
        }
        return {
          icon: <MessageSquare className="w-4 h-4" />,
          description: event.type,
          color: 'default' as const,
        };
      default:
        return {
          icon: <MessageSquare className="w-4 h-4" />,
          description: event.type,
          color: 'default' as const,
        };
    }
  };

  const { icon, description, color } = getEventDisplay();

  // Extract message for agent requests (type-safe)
  let agentMessage: string | undefined;
  if (event.type === 'agent_activity') {
    if (event.data.activityType === 'help_request' || event.data.activityType === 'blocker') {
      agentMessage = event.data.message;
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{plan.title}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip size="sm" variant="soft" color={color} className="gap-1">
            {icon}
            {event.type === 'agent_activity'
              ? event.data.activityType.replace('_', ' ')
              : description}
          </Chip>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.timestamp)}
          </span>
          {/* Show first 3 tags */}
          {plan.tags && plan.tags.length > 0 && (
            <div className="flex gap-1 items-center">
              {plan.tags.slice(0, 3).map((tag) => (
                <TagChip key={tag} tag={tag} size="sm" />
              ))}
              {plan.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">+{plan.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
        {/* Show full message for agent requests */}
        {agentMessage && (
          <p className="text-sm text-muted-foreground mt-1 pl-1">"{agentMessage}"</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onPress={() => onView(plan.id)}>
          View
        </Button>
      </div>
    </div>
  );
}

// --- Helper functions extracted to reduce component complexity ---

/** Filter and sort inbox plans based on show read preference */
function filterAndSortInboxPlans(
  allInboxPlans: (PlanIndexEntry & { isUnread?: boolean })[],
  showRead: boolean,
  selectedPlanId: string | null
): (PlanIndexEntry & { isUnread?: boolean })[] {
  const filtered = allInboxPlans.filter((plan) => {
    if (showRead) return true;
    return plan.isUnread || plan.id === selectedPlanId;
  });
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Group inbox events by category */
function groupInboxEvents(
  sortedInboxPlans: (PlanIndexEntry & { isUnread?: boolean })[],
  eventBasedInbox: InboxEventItem[]
) {
  return {
    needsReview: sortedInboxPlans,
    approvalRequests: eventBasedInbox.filter(
      (e: InboxEventItem) => e.event.type === 'approval_requested'
    ),
    mentions: eventBasedInbox.filter(
      (e: InboxEventItem) => e.event.type === 'comment_added' && e.event.data?.mentions
    ),
    readyToComplete: eventBasedInbox.filter(
      (e: InboxEventItem) => e.event.type === 'deliverable_linked' && e.event.data?.allFulfilled
    ),
    agentHelpRequests: eventBasedInbox.filter(
      (e: InboxEventItem) =>
        e.event.type === 'agent_activity' && e.event.data?.activityType === 'help_request'
    ),
    agentBlockers: eventBasedInbox.filter(
      (e: InboxEventItem) =>
        e.event.type === 'agent_activity' && e.event.data?.activityType === 'blocker'
    ),
  };
}

/** Hook for syncing panel selection with URL */
function usePanelUrlSync(selectedPlanId: string | null, navigate: ReturnType<typeof useNavigate>) {
  useEffect(() => {
    const path = selectedPlanId ? `?panel=${selectedPlanId}` : '';
    navigate(path, { replace: true });
  }, [selectedPlanId, navigate]);
}

/** Hook for listening to input request events */
function useInputRequestEventListener(
  setCurrentInputRequest: React.Dispatch<React.SetStateAction<InputRequest | null>>,
  setInputRequestModalOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    const handleOpenInputRequest = (event: Event) => {
      const customEvent = event as CustomEvent<InputRequest>;
      setCurrentInputRequest(customEvent.detail);
      setInputRequestModalOpen(true);
    };

    document.addEventListener('open-input-request', handleOpenInputRequest);
    return () => {
      document.removeEventListener('open-input-request', handleOpenInputRequest);
    };
  }, [setCurrentInputRequest, setInputRequestModalOpen]);
}

/** Hook for auto-deselecting read plans */
function useAutoDeselectReadPlan(
  selectedPlanId: string | null,
  allInboxPlans: (PlanIndexEntry & { isUnread?: boolean })[],
  showRead: boolean,
  setSelectedPlanId: React.Dispatch<React.SetStateAction<string | null>>
) {
  useEffect(() => {
    if (!selectedPlanId || showRead) return;

    const selectedPlan = allInboxPlans.find((p) => p.id === selectedPlanId);
    if (selectedPlan && !selectedPlan.isUnread) {
      setSelectedPlanId(null);
    }
  }, [selectedPlanId, allInboxPlans, showRead, setSelectedPlanId]);
}

/** Helper to get next item in list after current index */
function getNextOrPrevId(
  plans: (PlanIndexEntry & { isUnread?: boolean })[],
  currentIndex: number
): string | null {
  if (currentIndex < plans.length - 1) {
    return plans[currentIndex + 1]?.id ?? null;
  }
  if (currentIndex > 0) {
    return plans[currentIndex - 1]?.id ?? null;
  }
  return null;
}

/** Helper to navigate to adjacent item in list */
function navigateToAdjacentItem(
  selectedPlanId: string | null,
  plans: (PlanIndexEntry & { isUnread?: boolean })[],
  direction: 'next' | 'prev',
  setSelectedPlanId: React.Dispatch<React.SetStateAction<string | null>>
): void {
  if (!selectedPlanId) return;
  const currentIndex = plans.findIndex((p) => p.id === selectedPlanId);
  if (currentIndex === -1) return;

  const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  const isValidIndex = direction === 'next' ? currentIndex < plans.length - 1 : currentIndex > 0;

  if (isValidIndex) {
    const targetPlan = plans[targetIndex];
    if (targetPlan) {
      setSelectedPlanId(targetPlan.id);
    }
  }
}

/** Update plan metadata to in_progress status using type-safe transition helper */
function updatePlanToInProgress(ydoc: Y.Doc, now: number, actor: string, reviewedBy: string): void {
  // Transition may fail if plan is in an unexpected state - that's OK for drag-drop UI
  // The index update is the primary source of truth
  transitionPlanStatus(ydoc, { status: 'in_progress', reviewedAt: now, reviewedBy }, actor);
}

/** Update plan index entry to in_progress */
function updateIndexToInProgress(indexDoc: Y.Doc, planId: string, now: number): void {
  const entry = getPlanIndexEntry(indexDoc, planId);
  if (entry) {
    setPlanIndexEntry(indexDoc, {
      ...entry,
      status: 'in_progress',
      updatedAt: now,
    });
  }
}

/** Approve a plan by updating local IDB and index */
async function approvePlanInLocalDb(
  planId: string,
  now: number,
  actor: string,
  reviewedBy: string
): Promise<void> {
  try {
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;
    updatePlanToInProgress(planDoc, now, actor, reviewedBy);
    idb.destroy();
  } catch {
    // Plan doc may not exist locally
  }
}

/** Extract key from ListBox selection */
function extractFirstSelectionKey(keys: Set<unknown> | 'all'): string | null {
  if (keys === 'all') return null;
  const key = Array.from(keys)[0];
  return key ? String(key) : null;
}

/** Get current plan at index or null if not found */
function getCurrentPlanAtIndex(
  selectedPlanId: string | null,
  plans: (PlanIndexEntry & { isUnread?: boolean })[]
): { plan: PlanIndexEntry & { isUnread?: boolean }; index: number } | null {
  if (!selectedPlanId) return null;
  const idx = plans.findIndex((p) => p.id === selectedPlanId);
  if (idx === -1) return null;
  const plan = plans[idx];
  return plan ? { plan, index: idx } : null;
}

/** Calculate total inbox items count */
function calculateTotalInboxItems(
  sortedPlans: (PlanIndexEntry & { isUnread?: boolean })[],
  inboxGroups: ReturnType<typeof groupInboxEvents>,
  pendingRequestsCount: number
): number {
  return (
    sortedPlans.length +
    inboxGroups.mentions.length +
    inboxGroups.readyToComplete.length +
    inboxGroups.approvalRequests.length +
    inboxGroups.agentHelpRequests.length +
    inboxGroups.agentBlockers.length +
    pendingRequestsCount
  );
}

/** Generate inbox status message */
function getInboxStatusMessage(totalItems: number, allPlansCount: number): string {
  if (totalItems === 0 && allPlansCount > 0) {
    return `All caught up! ${allPlansCount} read ${allPlansCount === 1 ? 'item' : 'items'}`;
  }
  return `${totalItems} ${totalItems === 1 ? 'item needs' : 'items need'} your attention`;
}

export function InboxPage() {
  // All hooks at top of component - called in same order every render
  const navigate = useNavigate();
  const location = useLocation();
  const { identity: githubIdentity } = useGitHubAuth();
  const { allInboxPlans, markPlanAsRead, markPlanAsUnread, isLoading, timedOut } = usePlanIndex(
    githubIdentity?.username
  );
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const [showRead, setShowRead] = useState(getInboxShowRead);
  const { actor } = useUserIdentity();

  // Load event-based inbox items
  const eventBasedInbox = useInboxEvents(allInboxPlans, githubIdentity?.username ?? null);

  // Load input requests from the plan index doc
  const { pendingRequests } = useInputRequests({
    ydoc: indexDoc,
  });

  // Input request modal state
  const [inputRequestModalOpen, setInputRequestModalOpen] = useState(false);
  const [currentInputRequest, setCurrentInputRequest] = useState<InputRequest | null>(null);

  // Selected plan state - read from URL on mount
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);

  // Update show read preference
  const handleToggleShowRead = useCallback((value: boolean) => {
    setShowRead(value);
    setInboxShowRead(value);
  }, []);

  // Filter inbox plans - extracted to helper
  const sortedInboxPlans = useMemo(
    () => filterAndSortInboxPlans(allInboxPlans, showRead, selectedPlanId),
    [allInboxPlans, showRead, selectedPlanId]
  );

  // Group inbox items by category - extracted to helper
  const inboxGroups = useMemo(
    () => groupInboxEvents(sortedInboxPlans, eventBasedInbox),
    [sortedInboxPlans, eventBasedInbox]
  );

  // Effects extracted to custom hooks
  useAutoDeselectReadPlan(selectedPlanId, allInboxPlans, showRead, setSelectedPlanId);
  usePanelUrlSync(selectedPlanId, navigate);
  useInputRequestEventListener(setCurrentInputRequest, setInputRequestModalOpen);

  // Panel handlers
  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  // Dismiss handler (mark as read)
  const handleDismiss = useCallback(
    async (planId: string) => {
      await markPlanAsRead(planId);
      toast.success('Marked as read');
    },
    [markPlanAsRead]
  );

  // Mark as unread handler
  const handleMarkUnread = useCallback(
    async (planId: string) => {
      await markPlanAsUnread(planId);
      toast.success('Marked as unread');
    },
    [markPlanAsUnread]
  );

  // Helper to find the next plan to select after dismissal - uses extracted helper
  const getNextSelectedId = useCallback(
    (currentIndex: number): string | null => getNextOrPrevId(sortedInboxPlans, currentIndex),
    [sortedInboxPlans]
  );

  // Approve handler - uses extracted helpers to reduce complexity
  const handleApprove = useCallback(
    async (planId: string) => {
      if (!githubIdentity) {
        toast.error('Please sign in with GitHub first');
        return;
      }

      const now = Date.now();
      const reviewedBy = githubIdentity.displayName || githubIdentity.username;
      updateIndexToInProgress(indexDoc, planId, now);
      await approvePlanInLocalDb(planId, now, actor, reviewedBy);
      toast.success('Plan approved');
    },
    [githubIdentity, indexDoc, actor]
  );

  // Request changes handler
  const handleRequestChanges = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    toast.info('Open panel to add comments and request changes');
  }, []);

  // List selection handler - uses extracted helper
  const handleListSelection = useCallback((keys: Set<unknown> | 'all') => {
    const key = extractFirstSelectionKey(keys);
    if (key) setSelectedPlanId(key);
  }, []);

  // Event item view handler
  const handleViewEvent = useCallback((planId: string) => {
    setSelectedPlanId(planId);
  }, []);

  // Panel approve handler - uses extracted helpers
  const handlePanelApprove = useCallback(
    async (context: PlanActionContext) => {
      if (!githubIdentity) {
        toast.error('Please sign in with GitHub first');
        return;
      }

      const { planId, ydoc } = context;
      const now = Date.now();
      const reviewedBy = githubIdentity.displayName || githubIdentity.username;

      updatePlanToInProgress(ydoc, now, actor, reviewedBy);
      updateIndexToInProgress(indexDoc, planId, now);
      toast.success('Plan approved');
    },
    [githubIdentity, indexDoc, actor]
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

  // Navigation handlers use extracted helper to reduce complexity
  const handleNextItem = useCallback(() => {
    navigateToAdjacentItem(selectedPlanId, sortedInboxPlans, 'next', setSelectedPlanId);
  }, [selectedPlanId, sortedInboxPlans]);

  const handlePrevItem = useCallback(() => {
    navigateToAdjacentItem(selectedPlanId, sortedInboxPlans, 'prev', setSelectedPlanId);
  }, [selectedPlanId, sortedInboxPlans]);

  const handleKeyboardDismiss = useCallback(async () => {
    const current = getCurrentPlanAtIndex(selectedPlanId, sortedInboxPlans);
    if (!current) return;

    await handleDismiss(current.plan.id);
    setSelectedPlanId(getNextSelectedId(current.index));
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

  // Calculate total inbox items - extracted to helper
  const totalInboxItems = calculateTotalInboxItems(
    sortedInboxPlans,
    inboxGroups,
    pendingRequests.length
  );
  const statusMessage = getInboxStatusMessage(totalInboxItems, allInboxPlans.length);

  // Show zero state only if there are no items at all (including read items)
  if (totalInboxItems === 0 && allInboxPlans.length === 0) {
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
        {/* Offline banner */}
        {timedOut && <OfflineBanner />}

        {/* Header with show read toggle */}
        <div className="border-b border-separator shrink-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-foreground">Inbox</h1>
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
            <Switch size="sm" isSelected={showRead} onChange={handleToggleShowRead}>
              {showRead ? 'Hide read' : 'Show read'}
            </Switch>
          </div>
        </div>

        {/* Inbox results */}
        <div className="flex-1 overflow-y-auto p-2">
          <Accordion
            allowsMultipleExpanded
            defaultExpandedKeys={['agentInputNeeded', 'needsReview', 'mentions']}
          >
            {/* Agent Input Needed */}
            {pendingRequests.length > 0 && (
              <Accordion.Item id="agentInputNeeded">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <MessageSquare className="w-4 h-4 mr-2 shrink-0 text-accent" />
                    <span className="flex-1 text-left">Agent Input Needed</span>
                    <Chip size="sm" variant="soft" color="accent" className="mr-2">
                      {pendingRequests.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="space-y-2 px-3">
                      {pendingRequests.map((request) => (
                        <InputRequestInboxItem
                          key={request.id}
                          request={request}
                          onClick={() => {
                            document.dispatchEvent(
                              new CustomEvent('open-input-request', {
                                detail: request,
                              })
                            );
                          }}
                        />
                      ))}
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Needs Review */}
            {inboxGroups.needsReview.length > 0 && (
              <Accordion.Item id="needsReview">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <Clock className="w-4 h-4 mr-2 shrink-0 text-warning" />
                    <span className="flex-1 text-left">Needs Review</span>
                    <Chip size="sm" variant="soft" color="warning" className="mr-2">
                      {inboxGroups.needsReview.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <ListBox
                      aria-label="Plans needing review"
                      selectionMode="single"
                      selectedKeys={selectedPlanId ? new Set([selectedPlanId]) : new Set()}
                      onSelectionChange={handleListSelection}
                      className="divide-y divide-separator"
                    >
                      {inboxGroups.needsReview.map((plan) => (
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
                            onMarkUnread={handleMarkUnread}
                          />
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Mentions */}
            {inboxGroups.mentions.length > 0 && (
              <Accordion.Item id="mentions">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <AtSign className="w-4 h-4 mr-2 shrink-0 text-accent" />
                    <span className="flex-1 text-left">Mentions</span>
                    <Chip size="sm" variant="soft" color="accent" className="mr-2">
                      {inboxGroups.mentions.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="divide-y divide-separator">
                      {inboxGroups.mentions.map((item: InboxEventItem) => (
                        <div key={`${item.plan.id}-${item.event.id}`} className="px-3">
                          <EventInboxItem item={item} onView={handleViewEvent} />
                        </div>
                      ))}
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Ready to Complete */}
            {inboxGroups.readyToComplete.length > 0 && (
              <Accordion.Item id="readyToComplete">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <CheckCircle className="w-4 h-4 mr-2 shrink-0 text-success" />
                    <span className="flex-1 text-left">Ready to Complete</span>
                    <Chip size="sm" variant="soft" color="success" className="mr-2">
                      {inboxGroups.readyToComplete.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="divide-y divide-separator">
                      {inboxGroups.readyToComplete.map((item: InboxEventItem) => (
                        <div key={`${item.plan.id}-${item.event.id}`} className="px-3">
                          <EventInboxItem item={item} onView={handleViewEvent} />
                        </div>
                      ))}
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Approval Requests */}
            {inboxGroups.approvalRequests.length > 0 && (
              <Accordion.Item id="approvalRequests">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <UserPlus className="w-4 h-4 mr-2 shrink-0 text-warning" />
                    <span className="flex-1 text-left">Approval Requests</span>
                    <Chip size="sm" variant="soft" color="warning" className="mr-2">
                      {inboxGroups.approvalRequests.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="divide-y divide-separator">
                      {inboxGroups.approvalRequests.map((item: InboxEventItem) => (
                        <div key={`${item.plan.id}-${item.event.id}`} className="px-3">
                          <EventInboxItem item={item} onView={handleViewEvent} />
                        </div>
                      ))}
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Agent Help Requests */}
            {inboxGroups.agentHelpRequests.length > 0 && (
              <Accordion.Item id="agentHelpRequests">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <HelpCircle className="w-4 h-4 mr-2 shrink-0 text-warning" />
                    <span className="flex-1 text-left">Agent Help Requests</span>
                    <Chip size="sm" variant="soft" color="warning" className="mr-2">
                      {inboxGroups.agentHelpRequests.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="divide-y divide-separator">
                      {inboxGroups.agentHelpRequests.map((item: InboxEventItem) => (
                        <div key={`${item.plan.id}-${item.event.id}`} className="px-3">
                          <EventInboxItem item={item} onView={handleViewEvent} />
                        </div>
                      ))}
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {/* Agent Blockers */}
            {inboxGroups.agentBlockers.length > 0 && (
              <Accordion.Item id="agentBlockers">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <AlertOctagon className="w-4 h-4 mr-2 shrink-0 text-danger" />
                    <span className="flex-1 text-left">Agent Blockers</span>
                    <Chip size="sm" variant="soft" color="danger" className="mr-2">
                      {inboxGroups.agentBlockers.length}
                    </Chip>
                    <Accordion.Indicator>
                      <ChevronDown />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="divide-y divide-separator">
                      {inboxGroups.agentBlockers.map((item: InboxEventItem) => (
                        <div key={`${item.plan.id}-${item.event.id}`} className="px-3">
                          <EventInboxItem item={item} onView={handleViewEvent} />
                        </div>
                      ))}
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            )}
          </Accordion>
        </div>
      </div>

      {/* Right: Detail panel */}
      <div className="flex flex-col h-full overflow-hidden">
        <InlinePlanDetail
          planId={selectedPlanId}
          onClose={handleClosePanel}
          onApprove={handlePanelApprove}
          onRequestChanges={handlePanelRequestChanges}
          emptyMessage="Select a plan to view details"
        />
      </div>

      {/* Input Request Modal */}
      <InputRequestModal
        isOpen={inputRequestModalOpen}
        request={currentInputRequest}
        ydoc={indexDoc}
        onClose={() => {
          setInputRequestModalOpen(false);
          setCurrentInputRequest(null);
        }}
      />
    </div>
  );
}
