/**
 * Inbox Page - Shows plans needing review (pending_review status only).
 * Two-column layout with inbox list on left and detail panel on right.
 */

import { Accordion, Button, Chip, ListBox, ListBoxItem, Switch, Tooltip } from '@heroui/react';
import {
  type AnyInputRequest,
  AnyInputRequestSchema,
  assertNever,
  clearEventViewedBy,
  getPlanIndexEntry,
  markEventAsViewed,
  type PlanEvent,
  type PlanIndexEntry,
  type PlanStatusType,
  type PlanViewTab,
  setPlanIndexEntry,
  transitionPlanStatus,
} from '@shipyard/schema';
import {
  AlertTriangle,
  AtSign,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  FileText,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import type React from 'react';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { AnyInputRequestModal } from '@/components/AnyInputRequestModal';
import { InlinePlanDetail, type PlanActionContext } from '@/components/InlinePlanDetail';
import { InputRequestInboxItem } from '@/components/InputRequestInboxItem';
import { BaseInboxCard } from '@/components/inbox/BaseInboxCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { type PanelWidth, PlanPanel } from '@/components/PlanPanel';
import { TagChip } from '@/components/TagChip';
import { TruncatedText } from '@/components/ui/TruncatedText';
import { TwoColumnSkeleton } from '@/components/ui/TwoColumnSkeleton';
import { getPlanRoute } from '@/constants/routes';
import { usePlanIndexContext } from '@/contexts/PlanIndexContext';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { type InboxEventItem, useInboxEvents } from '@/hooks/useInboxEvents';
import { useInputRequests } from '@/hooks/useInputRequests';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
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
          <TruncatedText
            text={plan.title}
            maxLength={50}
            className={`font-medium truncate ${isRead ? 'text-muted-foreground' : 'text-foreground'}`}
          />
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
              aria-label="Approve task"
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
  onView: (planId: string, tab?: PlanViewTab) => void;
  onMarkRead: (planId: string, eventId: string) => void;
  onMarkUnread: (planId: string, eventId: string) => void;
}

function EventInboxItem({ item, onView, onMarkRead, onMarkUnread }: EventInboxItemProps) {
  const { plan, event, isUnread } = item;

  /** Determine icon and description based on event type */
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
        if (event.data?.activityType === 'update') {
          return {
            icon: <FileText className="w-4 h-4" />,
            description: 'posted an update',
            color: 'default' as const,
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

  const getTargetTab = (evt: PlanEvent): PlanViewTab => {
    switch (evt.type) {
      case 'plan_created':
      case 'comment_added':
      case 'comment_resolved':
      case 'content_edited':
        return 'plan';
      case 'deliverable_linked':
      case 'step_completed':
        return 'deliverables';
      case 'pr_linked':
      case 'conversation_imported':
      case 'conversation_handed_off':
      case 'conversation_exported':
        return 'changes';
      case 'status_changed':
      case 'artifact_uploaded':
      case 'approved':
      case 'changes_requested':
      case 'completed':
      case 'plan_archived':
      case 'plan_unarchived':
      case 'plan_shared':
      case 'approval_requested':
      case 'input_request_created':
      case 'input_request_answered':
      case 'input_request_declined':
      case 'agent_activity':
      case 'session_token_regenerated':
        return 'activity';
      default:
        return assertNever(evt);
    }
  };

  const handleClick = () => {
    onView(plan.id, getTargetTab(event));
    if (isUnread) {
      onMarkRead(plan.id, event.id);
    }
  };

  const expandedMessage =
    event.type === 'agent_activity' && event.data.activityType === 'update'
      ? event.data.message
      : undefined;

  return (
    <BaseInboxCard
      title={plan.title}
      isUnread={isUnread}
      onClick={handleClick}
      badge={
        <Chip size="sm" variant="soft" color={color} className="gap-1">
          {icon}
          {event.type === 'agent_activity'
            ? event.data.activityType.replace('_', ' ')
            : description}
        </Chip>
      }
      metadata={
        <>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.timestamp)}
          </span>
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
        </>
      }
      expandedContent={
        expandedMessage && (
          <p className="text-sm text-muted-foreground mt-1 pl-1">"{expandedMessage}"</p>
        )
      }
      actions={
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              onPress={() => {
                isUnread ? onMarkRead(plan.id, event.id) : onMarkUnread(plan.id, event.id);
              }}
            >
              {isUnread ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{isUnread ? 'Mark as read' : 'Mark as unread'}</Tooltip.Content>
        </Tooltip>
      }
    />
  );
}

/** --- Reusable Accordion Section Component --- */

type InboxAccordionSectionProps = PropsWithChildren<{
  id: string;
  icon: React.JSX.Element;
  iconColorClass: string;
  title: string;
  count: number;
  chipColor: 'warning' | 'danger' | 'success' | 'default' | 'accent';
}>;

/** Reusable accordion section for inbox groups - reduces JSX complexity in main component */
function InboxAccordionSection({
  id,
  icon,
  iconColorClass,
  title,
  count,
  chipColor,
  children,
}: InboxAccordionSectionProps) {
  return (
    <Accordion.Item id={id}>
      <Accordion.Heading>
        <Accordion.Trigger>
          <span
            className={`w-4 h-4 mr-2 shrink-0 flex items-center justify-center ${iconColorClass}`}
          >
            {icon}
          </span>
          <span className="flex-1 text-left">{title}</span>
          <Chip size="sm" variant="soft" color={chipColor} className="mr-2">
            {count}
          </Chip>
          <Accordion.Indicator>
            <ChevronDown />
          </Accordion.Indicator>
        </Accordion.Trigger>
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body>{children}</Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

/** --- Helper functions extracted to reduce component complexity --- */

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
  eventBasedInbox: InboxEventItem[],
  showRead: boolean,
  selectedPlanId: string | null
) {
  const filterByReadState = (items: InboxEventItem[]) => {
    if (showRead) return items;
    return items.filter((item) => item.isUnread || item.plan.id === selectedPlanId);
  };

  return {
    needsReview: sortedInboxPlans,
    approvalRequests: filterByReadState(
      eventBasedInbox.filter((e: InboxEventItem) => e.event.type === 'approval_requested')
    ),
    mentions: filterByReadState(
      eventBasedInbox.filter(
        (e: InboxEventItem) => e.event.type === 'comment_added' && e.event.data?.mentions
      )
    ),
    readyToComplete: filterByReadState(
      eventBasedInbox.filter(
        (e: InboxEventItem) => e.event.type === 'deliverable_linked' && e.event.data?.allFulfilled
      )
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
  setCurrentInputRequest: React.Dispatch<React.SetStateAction<AnyInputRequest | null>>,
  setInputRequestModalOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    const handleOpenInputRequest = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const result = AnyInputRequestSchema.safeParse(event.detail);
      if (result.success) {
        setCurrentInputRequest(result.data);
        setInputRequestModalOpen(true);
      }
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
  /*
   * Transition may fail if plan is in an unexpected state - that's OK for drag-drop UI
   * The index update is the primary source of truth
   */
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

/** Update plan metadata to changes_requested status using type-safe transition helper */
function updatePlanToChangesRequested(
  ydoc: Y.Doc,
  now: number,
  actor: string,
  reviewedBy: string
): void {
  transitionPlanStatus(ydoc, { status: 'changes_requested', reviewedAt: now, reviewedBy }, actor);
}

/** Update plan index entry to changes_requested */
function updateIndexToChangesRequested(indexDoc: Y.Doc, planId: string, now: number): void {
  const entry = getPlanIndexEntry(indexDoc, planId);
  if (entry) {
    setPlanIndexEntry(indexDoc, {
      ...entry,
      status: 'changes_requested',
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
    /** Plan doc may not exist locally */
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

/** --- Event List Component - Reduces JSX complexity in main component --- */

interface EventItemListProps {
  items: InboxEventItem[];
  onView: (planId: string, tab?: PlanViewTab) => void;
  onMarkRead: (planId: string, eventId: string) => void;
  onMarkUnread: (planId: string, eventId: string) => void;
}

/** Renders a list of event inbox items */
function EventItemList({ items, onView, onMarkRead, onMarkUnread }: EventItemListProps) {
  return (
    <div className="divide-y divide-separator">
      {items.map((item: InboxEventItem) => (
        <div key={`${item.plan.id}-${item.event.id}`} className="px-3">
          <EventInboxItem
            item={item}
            onView={onView}
            onMarkRead={onMarkRead}
            onMarkUnread={onMarkUnread}
          />
        </div>
      ))}
    </div>
  );
}

/** --- Inbox Accordion Content Component - Moves conditional rendering out of main component --- */

interface InboxAccordionContentProps {
  pendingRequests: AnyInputRequest[];
  inboxGroups: ReturnType<typeof groupInboxEvents>;
  selectedPlanId: string | null;
  handleListSelection: (keys: Set<unknown> | 'all') => void;
  handleApprove: (planId: string) => void;
  handleRequestChanges: (planId: string) => void;
  handleDismiss: (planId: string) => void;
  handleMarkUnread: (planId: string) => void;
  handleViewEvent: (planId: string, tab?: PlanViewTab) => void;
  handleMarkEventRead: (planId: string, eventId: string) => void;
  handleMarkEventUnread: (planId: string, eventId: string) => void;
  /** Look up plan title by ID */
  getPlanTitle: (planId: string) => string | undefined;
  /** Select a plan to show in detail panel */
  handleSelectPlan: (planId: string) => void;
}

/** Renders all inbox accordion sections - extracts conditional logic from main component */
function InboxAccordionContent({
  pendingRequests,
  inboxGroups,
  selectedPlanId,
  handleListSelection,
  handleApprove,
  handleRequestChanges,
  handleDismiss,
  handleMarkUnread,
  handleViewEvent,
  handleMarkEventRead,
  handleMarkEventUnread,
  getPlanTitle,
  handleSelectPlan,
}: InboxAccordionContentProps) {
  return (
    <Accordion
      allowsMultipleExpanded
      defaultExpandedKeys={['agentInputNeeded', 'needsReview', 'mentions']}
    >
      {/* Agent Input Needed */}
      {pendingRequests.length > 0 && (
        <InboxAccordionSection
          id="agentInputNeeded"
          icon={<MessageSquare className="w-4 h-4" />}
          iconColorClass="text-accent"
          title="Agent Input Needed"
          count={pendingRequests.length}
          chipColor="accent"
        >
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
                planTitle={request.planId ? getPlanTitle(request.planId) : undefined}
                onSelectPlan={request.planId ? handleSelectPlan : undefined}
              />
            ))}
          </div>
        </InboxAccordionSection>
      )}

      {/* Needs Review */}
      {inboxGroups.needsReview.length > 0 && (
        <InboxAccordionSection
          id="needsReview"
          icon={<Clock className="w-4 h-4" />}
          iconColorClass="text-warning"
          title="Needs Review"
          count={inboxGroups.needsReview.length}
          chipColor="warning"
        >
          <ListBox
            aria-label="Tasks needing review"
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
        </InboxAccordionSection>
      )}

      {/* Mentions */}
      {inboxGroups.mentions.length > 0 && (
        <InboxAccordionSection
          id="mentions"
          icon={<AtSign className="w-4 h-4" />}
          iconColorClass="text-accent"
          title="Mentions"
          count={inboxGroups.mentions.length}
          chipColor="accent"
        >
          <EventItemList
            items={inboxGroups.mentions}
            onView={handleViewEvent}
            onMarkRead={handleMarkEventRead}
            onMarkUnread={handleMarkEventUnread}
          />
        </InboxAccordionSection>
      )}

      {/* Ready to Complete */}
      {inboxGroups.readyToComplete.length > 0 && (
        <InboxAccordionSection
          id="readyToComplete"
          icon={<CheckCircle className="w-4 h-4" />}
          iconColorClass="text-success"
          title="Ready to Complete"
          count={inboxGroups.readyToComplete.length}
          chipColor="success"
        >
          <EventItemList
            items={inboxGroups.readyToComplete}
            onView={handleViewEvent}
            onMarkRead={handleMarkEventRead}
            onMarkUnread={handleMarkEventUnread}
          />
        </InboxAccordionSection>
      )}

      {/* Approval Requests */}
      {inboxGroups.approvalRequests.length > 0 && (
        <InboxAccordionSection
          id="approvalRequests"
          icon={<UserPlus className="w-4 h-4" />}
          iconColorClass="text-warning"
          title="Approval Requests"
          count={inboxGroups.approvalRequests.length}
          chipColor="warning"
        >
          <EventItemList
            items={inboxGroups.approvalRequests}
            onView={handleViewEvent}
            onMarkRead={handleMarkEventRead}
            onMarkUnread={handleMarkEventUnread}
          />
        </InboxAccordionSection>
      )}
    </Accordion>
  );
}

/** --- Detail Panel Component - Moves conditional rendering out of main component --- */

interface InboxDetailPanelProps {
  isMobile: boolean;
  selectedPlanId: string | null;
  selectedTab: PlanViewTab;
  mobilePanelWidth: PanelWidth;
  setMobilePanelWidth: React.Dispatch<React.SetStateAction<PanelWidth>>;
  handleClosePanel: () => void;
  handlePanelApprove: (context: PlanActionContext) => Promise<void>;
  handlePanelRequestChanges: (context: PlanActionContext) => void;
  handleStatusChange: (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => void;
}

/** Renders the detail panel - handles mobile vs desktop layout */
function InboxDetailPanel({
  isMobile,
  selectedPlanId,
  selectedTab,
  mobilePanelWidth,
  setMobilePanelWidth,
  handleClosePanel,
  handlePanelApprove,
  handlePanelRequestChanges,
  handleStatusChange,
}: InboxDetailPanelProps) {
  const detailContent = (
    <InlinePlanDetail
      planId={selectedPlanId}
      initialTab={selectedTab}
      onClose={handleClosePanel}
      onApprove={handlePanelApprove}
      onRequestChanges={handlePanelRequestChanges}
      onStatusChange={handleStatusChange}
      emptyMessage="Select a plan to view details"
    />
  );

  if (isMobile) {
    return (
      <PlanPanel
        planId={selectedPlanId}
        width={mobilePanelWidth}
        onClose={handleClosePanel}
        onChangeWidth={setMobilePanelWidth}
      >
        {detailContent}
      </PlanPanel>
    );
  }

  return <div className="flex flex-col h-full overflow-hidden">{detailContent}</div>;
}

export function InboxPage() {
  /** All hooks at top of component - called in same order every render */
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { identity: githubIdentity } = useGitHubAuth();
  const {
    allInboxPlans,
    allOwnedPlans,
    markPlanAsRead,
    markPlanAsUnread,
    isLoading,
    timedOut,
    reconnect,
    isReconnecting,
    ydoc: indexDoc,
  } = usePlanIndexContext();
  const [showRead, setShowRead] = useState(getInboxShowRead);
  const { actor } = useUserIdentity();

  /** Mobile panel state */
  const [mobilePanelWidth, setMobilePanelWidth] = useState<PanelWidth>('peek');

  /*
   * Load event-based inbox items from ALL owned plans (not just inbox candidates)
   * This ensures blockers/help requests show up regardless of plan status
   */
  const eventBasedInbox = useInboxEvents(allOwnedPlans, githubIdentity?.username ?? null, indexDoc);

  /** Load input requests from the plan index doc */
  const { pendingRequests } = useInputRequests({
    ydoc: indexDoc,
  });

  /** Input request modal state */
  const [inputRequestModalOpen, setInputRequestModalOpen] = useState(false);
  const [currentInputRequest, setCurrentInputRequest] = useState<AnyInputRequest | null>(null);

  /** Selected plan state - read from URL on mount */
  const searchParams = new URLSearchParams(location.search);
  const initialPanelId = searchParams.get('panel');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);
  const [selectedTab, setSelectedTab] = useState<PlanViewTab>('plan');

  /** Update show read preference */
  const handleToggleShowRead = useCallback((value: boolean) => {
    setShowRead(value);
    setInboxShowRead(value);
  }, []);

  /** Filter inbox plans - extracted to helper */
  const sortedInboxPlans = useMemo(
    () => filterAndSortInboxPlans(allInboxPlans, showRead, selectedPlanId),
    [allInboxPlans, showRead, selectedPlanId]
  );

  /** Group inbox items by category - extracted to helper */
  const inboxGroups = useMemo(
    () => groupInboxEvents(sortedInboxPlans, eventBasedInbox, showRead, selectedPlanId),
    [sortedInboxPlans, eventBasedInbox, showRead, selectedPlanId]
  );

  /** Effects extracted to custom hooks */
  useAutoDeselectReadPlan(selectedPlanId, allInboxPlans, showRead, setSelectedPlanId);
  usePanelUrlSync(selectedPlanId, navigate);
  useInputRequestEventListener(setCurrentInputRequest, setInputRequestModalOpen);

  /** Panel handlers */
  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
    setSelectedTab('plan');
  }, []);

  /** Dismiss handler (mark as read) */
  const handleDismiss = useCallback(
    async (planId: string) => {
      await markPlanAsRead(planId);
      toast.success('Marked as read');
    },
    [markPlanAsRead]
  );

  /** Mark as unread handler */
  const handleMarkUnread = useCallback(
    async (planId: string) => {
      await markPlanAsUnread(planId);
      toast.success('Marked as unread');
    },
    [markPlanAsUnread]
  );

  /** Event read/unread handlers */
  const handleMarkEventRead = useCallback(
    (planId: string, eventId: string) => {
      if (!githubIdentity) return;
      markEventAsViewed(indexDoc, planId, eventId, githubIdentity.username);
    },
    [indexDoc, githubIdentity]
  );

  const handleMarkEventUnread = useCallback(
    (planId: string, eventId: string) => {
      if (!githubIdentity) return;
      clearEventViewedBy(indexDoc, planId, eventId, githubIdentity.username);
    },
    [indexDoc, githubIdentity]
  );

  /** Helper to find the next plan to select after dismissal - uses extracted helper */
  const getNextSelectedId = useCallback(
    (currentIndex: number): string | null => getNextOrPrevId(sortedInboxPlans, currentIndex),
    [sortedInboxPlans]
  );

  /** Approve handler - uses extracted helpers to reduce complexity */
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
      toast.success('Task approved');
    },
    [githubIdentity, indexDoc, actor]
  );

  /** Request changes handler */
  const handleRequestChanges = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    toast.info('Open panel to add comments and request changes');
  }, []);

  /** List selection handler - uses extracted helper */
  const handleListSelection = useCallback(
    (keys: Set<unknown> | 'all') => {
      const key = extractFirstSelectionKey(keys);
      if (key) {
        setSelectedPlanId(key);
        const selectedPlan = sortedInboxPlans.find((p) => p.id === key);
        if (selectedPlan?.isUnread) {
          markPlanAsRead(key);
        }
      }
    },
    [sortedInboxPlans, markPlanAsRead]
  );

  /** Event item view handler */
  const handleViewEvent = useCallback((planId: string, tab?: PlanViewTab) => {
    setSelectedPlanId(planId);
    setSelectedTab(tab || 'plan');
  }, []);

  /** Panel approve handler - uses extracted helpers */
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
      toast.success('Task approved');
    },
    [githubIdentity, indexDoc, actor]
  );

  /** Panel request changes handler - works inline like approve */
  const handlePanelRequestChanges = useCallback(
    (context: PlanActionContext) => {
      if (!githubIdentity) {
        toast.error('Please sign in with GitHub first');
        return;
      }

      const { planId, ydoc } = context;
      const now = Date.now();
      const reviewedBy = githubIdentity.displayName || githubIdentity.username;

      updatePlanToChangesRequested(ydoc, now, actor, reviewedBy);
      updateIndexToChangesRequested(indexDoc, planId, now);
      toast.success('Changes requested - add comments below');
    },
    [githubIdentity, indexDoc, actor]
  );

  /** Status change handler for ReviewActions (updates plan index) */
  const handleStatusChange = useCallback(
    (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => {
      if (!selectedPlanId) return;

      const entry = getPlanIndexEntry(indexDoc, selectedPlanId);
      if (entry) {
        setPlanIndexEntry(indexDoc, {
          ...entry,
          status: newStatus,
          updatedAt,
        });
      }
    },
    [indexDoc, selectedPlanId]
  );

  /** Look up plan title from owned plans (for input request items) */
  const getPlanTitle = useCallback(
    (planId: string): string | undefined => {
      const plan = allOwnedPlans.find((p) => p.id === planId);
      return plan?.title;
    },
    [allOwnedPlans]
  );

  /** Select a plan to show in the detail panel (for input request plan links) */
  const handleSelectPlan = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    setSelectedTab('plan');
  }, []);

  /** Keyboard shortcut handlers - all extracted to top level */
  const handleFullScreen = useCallback(() => {
    if (selectedPlanId) {
      setSidebarCollapsed(true);
      navigate(getPlanRoute(selectedPlanId));
    }
  }, [selectedPlanId, navigate]);

  /** Navigation handlers use extracted helper to reduce complexity */
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

  /** Keyboard shortcuts for panel */
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

  /** Calculate total inbox items - extracted to helper */
  const totalInboxItems = calculateTotalInboxItems(
    sortedInboxPlans,
    inboxGroups,
    pendingRequests.length
  );
  const statusMessage = getInboxStatusMessage(totalInboxItems, allInboxPlans.length);

  /** Show zero state only if there are no items at all (including read items) */
  if (totalInboxItems === 0 && allInboxPlans.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Inbox Zero!</h1>
          <p className="text-sm text-muted-foreground">No tasks need your attention right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-full ${isMobile ? 'flex flex-col' : 'grid grid-cols-[minmax(300px,400px)_1fr]'}`}
    >
      {/* Inbox list */}
      <div
        className={`flex flex-col h-full overflow-hidden ${isMobile ? '' : 'border-r border-separator'}`}
      >
        {/* Offline banner */}
        {timedOut && <OfflineBanner onRetry={reconnect} isReconnecting={isReconnecting} />}

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
          <InboxAccordionContent
            pendingRequests={pendingRequests}
            inboxGroups={inboxGroups}
            selectedPlanId={selectedPlanId}
            handleListSelection={handleListSelection}
            handleApprove={handleApprove}
            handleRequestChanges={handleRequestChanges}
            handleDismiss={handleDismiss}
            handleMarkUnread={handleMarkUnread}
            handleViewEvent={handleViewEvent}
            handleMarkEventRead={handleMarkEventRead}
            handleMarkEventUnread={handleMarkEventUnread}
            getPlanTitle={getPlanTitle}
            handleSelectPlan={handleSelectPlan}
          />
        </div>
      </div>

      {/* Detail panel - handles mobile vs desktop layout */}
      <InboxDetailPanel
        isMobile={isMobile}
        selectedPlanId={selectedPlanId}
        selectedTab={selectedTab}
        mobilePanelWidth={mobilePanelWidth}
        setMobilePanelWidth={setMobilePanelWidth}
        handleClosePanel={handleClosePanel}
        handlePanelApprove={handlePanelApprove}
        handlePanelRequestChanges={handlePanelRequestChanges}
        handleStatusChange={handleStatusChange}
      />

      {/* Input Request Modal */}
      <AnyInputRequestModal
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
