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
} from '@peer-plan/schema';
import {
  AlertTriangle,
  AtSign,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
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
      default:
        return {
          icon: <MessageSquare className="w-4 h-4" />,
          description: event.type,
          color: 'default' as const,
        };
    }
  };

  const { icon, description, color } = getEventDisplay();

  return (
    <div className="flex items-center justify-between gap-3 w-full py-2">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{plan.title}</span>
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft" color={color} className="gap-1">
            {icon}
            {description}
          </Chip>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.timestamp)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onPress={() => onView(plan.id)}>
          View
        </Button>
      </div>
    </div>
  );
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

  // Filter inbox plans
  const sortedInboxPlans = useMemo(() => {
    const filtered = allInboxPlans.filter((plan) => {
      // Show all plans when toggle is ON
      if (showRead) return true;

      // Show unread plans OR currently selected plan (so you can view it)
      return plan.isUnread || plan.id === selectedPlanId;
    });

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [allInboxPlans, showRead, selectedPlanId]);

  // Group inbox items by category
  const inboxGroups = useMemo(() => {
    const statusBasedInbox = sortedInboxPlans;

    return {
      needsReview: statusBasedInbox, // All inbox items are pending_review now
      approvalRequests: eventBasedInbox.filter(
        (e: InboxEventItem) => e.event.type === 'approval_requested'
      ),
      mentions: eventBasedInbox.filter(
        (e: InboxEventItem) => e.event.type === 'comment_added' && e.event.data?.mentions
      ),
      readyToComplete: eventBasedInbox.filter(
        (e: InboxEventItem) => e.event.type === 'deliverable_linked' && e.event.data?.allFulfilled
      ),
    };
  }, [sortedInboxPlans, eventBasedInbox]);

  // Auto-deselect if selected plan is marked as read (and show read is OFF)
  useEffect(() => {
    if (!selectedPlanId || showRead) return;

    const selectedPlan = allInboxPlans.find((p) => p.id === selectedPlanId);
    // If plan is no longer unread, deselect it
    if (selectedPlan && !selectedPlan.isUnread) {
      setSelectedPlanId(null);
    }
  }, [selectedPlanId, allInboxPlans, showRead]);

  // Update URL when panel state changes
  useEffect(() => {
    if (selectedPlanId) {
      navigate(`?panel=${selectedPlanId}`, { replace: true });
    } else {
      navigate('', { replace: true });
    }
  }, [selectedPlanId, navigate]);

  // Listen for open-input-request events
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
  }, []);

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

        planDoc.transact(
          () => {
            const metadata = planDoc.getMap('metadata');
            const reviewRequestId = metadata.get('reviewRequestId') as string | undefined;

            metadata.set('status', 'in_progress');
            metadata.set('updatedAt', now);

            // Preserve reviewRequestId if present (hook needs this to match)
            if (reviewRequestId !== undefined) {
              metadata.set('reviewRequestId', reviewRequestId);
            }
          },
          { actor }
        );

        idb.destroy();
      } catch {
        // Plan doc may not exist locally
      }

      toast.success('Plan approved');
    },
    [githubIdentity, indexDoc, actor]
  );

  // Request changes handler
  const handleRequestChanges = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    toast.info('Open panel to add comments and request changes');
  }, []);

  // List selection handler
  const handleListSelection = useCallback((keys: Set<unknown> | 'all') => {
    if (keys === 'all') return;
    const key = Array.from(keys)[0];
    if (key) {
      setSelectedPlanId(String(key));
    }
  }, []);

  // Event item view handler
  const handleViewEvent = useCallback((planId: string) => {
    setSelectedPlanId(planId);
  }, []);

  // Panel approve handler
  const handlePanelApprove = useCallback(
    async (context: PlanActionContext) => {
      const { planId, ydoc } = context;

      const now = Date.now();

      ydoc.transact(
        () => {
          const metadata = ydoc.getMap('metadata');
          const reviewRequestId = metadata.get('reviewRequestId') as string | undefined;

          metadata.set('status', 'in_progress');
          metadata.set('updatedAt', now);

          // Preserve reviewRequestId if present (hook needs this to match)
          if (reviewRequestId !== undefined) {
            metadata.set('reviewRequestId', reviewRequestId);
          }
        },
        { actor }
      );

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
    [indexDoc, actor]
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
      }
    }
  }, [selectedPlanId, sortedInboxPlans]);

  const handlePrevItem = useCallback(() => {
    if (!selectedPlanId) return;
    const currentIndex = sortedInboxPlans.findIndex((p) => p.id === selectedPlanId);
    if (currentIndex > 0) {
      const prevPlan = sortedInboxPlans[currentIndex - 1];
      if (prevPlan) {
        setSelectedPlanId(prevPlan.id);
      }
    }
  }, [selectedPlanId, sortedInboxPlans]);

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

  // Calculate total inbox items
  const totalInboxItems =
    sortedInboxPlans.length +
    inboxGroups.mentions.length +
    inboxGroups.readyToComplete.length +
    inboxGroups.approvalRequests.length +
    pendingRequests.length;

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
              <p className="text-sm text-muted-foreground">
                {totalInboxItems === 0 && allInboxPlans.length > 0
                  ? `All caught up! ${allInboxPlans.length} read ${allInboxPlans.length === 1 ? 'item' : 'items'}`
                  : `${totalInboxItems} ${totalInboxItems === 1 ? 'item needs' : 'items need'} your attention`}
              </p>
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
