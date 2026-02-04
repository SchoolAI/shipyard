import { Accordion, Button, Chip, Kbd, ListBox, ListBoxItem, Switch, Tooltip } from '@heroui/react';
import {
  type TaskEventItem,
  type TaskId,
  type TaskIndexEntry,
  toTaskId,
} from '@shipyard/loro-schema';
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
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AnyInputRequestModal } from '@/components/any-input-request-modal';
import {
  PendingRequestsSection,
  type PendingRequestWithContext,
} from '@/components/inbox/pending-requests-section';
import { StatusChip } from '@/components/status-chip';
import { InlineTaskDetail } from '@/components/task/inline-task-detail';
import { type PanelWidth, TaskPanel } from '@/components/task/task-panel';
import { TruncatedText } from '@/components/ui/truncated-text';
import { getTaskRoute } from '@/constants/routes';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import {
  useInboxEvents,
  useRoomHandle,
  useTaskIndex,
  useTasksWithPendingRequests,
} from '@/loro/selectors/room-selectors';
import { formatRelativeTime } from '@/utils/formatters';

type EventType = TaskEventItem['type'];

interface InboxEventItem {
  taskId: TaskId;
  event: TaskEventItem;
  task: TaskIndexEntry[string];
  isUnread: boolean;
}

type InboxNavigableItem =
  | { type: 'task'; taskId: TaskId; isUnread: boolean; canApprove: boolean }
  | { type: 'event'; taskId: TaskId; eventId: string; isUnread: boolean }
  | { type: 'request'; requestId: string; taskId: TaskId };

function enrichInboxEvents(
  inboxEvents: { taskId: string; event: TaskEventItem }[],
  taskIndex: Record<string, TaskIndexEntry[string]>,
  username: string | null
): InboxEventItem[] {
  if (!username) return [];

  return inboxEvents
    .map(({ taskId, event }) => {
      const task = taskIndex[taskId];
      if (!task) return null;

      const eventViewedBy = task.eventViewedBy?.[event.id];
      const isUnread = !eventViewedBy || eventViewedBy[username] === undefined;

      return { taskId: toTaskId(taskId), event, task, isUnread };
    })
    .filter((item): item is InboxEventItem => item !== null);
}

function computePendingReviewTasks(
  taskIndex: Record<string, TaskIndexEntry[string]>,
  username: string | null
): { task: TaskIndexEntry[string]; isUnread: boolean }[] {
  if (!username) return [];

  return Object.values(taskIndex)
    .filter((task) => task.status === 'pending_review')
    .map((task) => {
      const viewedAt = task.viewedBy?.[username];
      const isUnread = viewedAt === undefined || task.lastUpdated > viewedAt;
      return { task, isUnread };
    })
    .sort((a, b) => b.task.lastUpdated - a.task.lastUpdated);
}

interface GroupedEvents {
  mentions: InboxEventItem[];
  inputRequests: InboxEventItem[];
  deliverablesFulfilled: InboxEventItem[];
  agentActivity: InboxEventItem[];
  other: InboxEventItem[];
}

const GROUPED_EVENT_TYPES = [
  'comment_added',
  'input_request_created',
  'deliverable_linked',
  'agent_activity',
] as const;

function groupEventsByType(events: InboxEventItem[]): GroupedEvents {
  const mentions = events.filter((e) => e.event.type === 'comment_added');
  const inputRequests = events.filter((e) => e.event.type === 'input_request_created');
  const deliverablesFulfilled = events.filter((e) => e.event.type === 'deliverable_linked');
  const agentActivity = events.filter((e) => e.event.type === 'agent_activity');
  const other = events.filter(
    (e) => !GROUPED_EVENT_TYPES.includes(e.event.type as (typeof GROUPED_EVENT_TYPES)[number])
  );
  return { mentions, inputRequests, deliverablesFulfilled, agentActivity, other };
}

function buildNavigableItems(
  tasksWithPendingRequests: { taskId: string }[],
  filteredTasks: { task: TaskIndexEntry[string]; isUnread: boolean }[],
  groupedEvents: GroupedEvents
): InboxNavigableItem[] {
  const items: InboxNavigableItem[] = [];

  for (const taskEntry of tasksWithPendingRequests) {
    items.push({
      type: 'request',
      requestId: taskEntry.taskId,
      taskId: toTaskId(taskEntry.taskId),
    });
  }

  for (const { task, isUnread } of filteredTasks) {
    items.push({
      type: 'task',
      taskId: toTaskId(task.taskId),
      isUnread,
      canApprove: task.status === 'pending_review',
    });
  }

  const allEvents = [
    ...groupedEvents.mentions,
    ...groupedEvents.inputRequests,
    ...groupedEvents.deliverablesFulfilled,
    ...groupedEvents.agentActivity,
    ...groupedEvents.other,
  ];
  for (const item of allEvents) {
    items.push({
      type: 'event',
      taskId: item.taskId,
      eventId: item.event.id,
      isUnread: item.isUnread,
    });
  }

  return items;
}

type TaskIndexMap = ReturnType<typeof useRoomHandle>['doc']['taskIndex'];

function markEventViewed(
  taskIndexDoc: TaskIndexMap,
  taskId: TaskId,
  eventId: string,
  username: string | null,
  markAsRead: boolean
): void {
  if (!username) return;
  const taskEntry = taskIndexDoc.get(taskId);
  if (!taskEntry) return;

  if (markAsRead) {
    let eventViewedBy = taskEntry.eventViewedBy.get(eventId);
    if (!eventViewedBy) {
      taskEntry.eventViewedBy.set(eventId, {});
      eventViewedBy = taskEntry.eventViewedBy.get(eventId);
    }
    if (eventViewedBy) eventViewedBy.set(username, Date.now());
  } else {
    const eventViewedBy = taskEntry.eventViewedBy.get(eventId);
    if (eventViewedBy) eventViewedBy.delete(username);
  }
}

function markTaskViewed(
  taskIndexDoc: TaskIndexMap,
  taskId: TaskId,
  username: string | null,
  markAsRead: boolean
): void {
  if (!username) return;
  const taskEntry = taskIndexDoc.get(taskId);
  if (!taskEntry) return;

  if (markAsRead) {
    taskEntry.viewedBy.set(username, Date.now());
  } else {
    taskEntry.viewedBy.delete(username);
  }
}

function filterByReadState<T extends { isUnread: boolean }>(items: T[], showRead: boolean): T[] {
  return showRead ? items : items.filter((item) => item.isUnread);
}

function handleTaskSelectionChange(
  keys: Set<unknown> | 'all',
  setSelectedTaskId: (id: string | null) => void,
  openTaskPanel: (id: string) => void
): void {
  if (keys === 'all') return;
  const key = Array.from(keys)[0];
  if (key) {
    setSelectedTaskId(String(key));
    openTaskPanel(String(key));
  }
}

function getFocusedItem(
  focusedIndex: number,
  navigableItems: InboxNavigableItem[]
): InboxNavigableItem | null {
  if (focusedIndex < 0 || focusedIndex >= navigableItems.length) return null;
  return navigableItems[focusedIndex] ?? null;
}

function navigateToNextItem(
  itemCount: number,
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>
): void {
  if (itemCount === 0) return;
  setFocusedIndex((prev) => (prev < 0 ? 0 : Math.min(prev + 1, itemCount - 1)));
}

function navigateToPrevItem(
  itemCount: number,
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>
): void {
  if (itemCount === 0) return;
  setFocusedIndex((prev) => (prev < 0 ? 0 : Math.max(prev - 1, 0)));
}

function getEventIcon(eventType: EventType): React.ReactNode {
  switch (eventType) {
    case 'comment_added':
      return <MessageSquare className="w-4 h-4" />;
    case 'deliverable_linked':
      return <CheckCircle className="w-4 h-4" />;
    case 'agent_activity':
      return <FileText className="w-4 h-4" />;
    case 'status_changed':
      return <Clock className="w-4 h-4" />;
    case 'changes_requested':
      return <AlertTriangle className="w-4 h-4" />;
    case 'approved':
      return <Check className="w-4 h-4" />;
    case 'input_request_created':
      return <AtSign className="w-4 h-4" />;
    default:
      return <MessageSquare className="w-4 h-4" />;
  }
}

function getEventDescription(event: TaskEventItem): string {
  switch (event.type) {
    case 'comment_added':
      return `${event.actor} commented`;
    case 'deliverable_linked':
      return 'Deliverable linked';
    case 'agent_activity':
      return `Agent: ${event.message.slice(0, 50)}${event.message.length > 50 ? '...' : ''}`;
    case 'status_changed':
      return `Status: ${event.fromStatus} → ${event.toStatus}`;
    case 'changes_requested':
      return `${event.actor} requested changes`;
    case 'approved':
      return `${event.actor} approved`;
    case 'task_created':
      return `${event.actor} created task`;
    case 'completed':
      return `${event.actor} completed task`;
    case 'input_request_created':
      return `Agent needs input: ${event.message.slice(0, 40)}${event.message.length > 40 ? '...' : ''}`;
    default:
      return event.type.replace(/_/g, ' ');
  }
}

function getEventChipColor(
  eventType: EventType
): 'warning' | 'danger' | 'success' | 'default' | 'accent' {
  switch (eventType) {
    case 'input_request_created':
    case 'status_changed':
      return 'warning';
    case 'changes_requested':
      return 'danger';
    case 'approved':
    case 'completed':
    case 'deliverable_linked':
      return 'success';
    case 'comment_added':
    case 'agent_activity':
      return 'accent';
    default:
      return 'default';
  }
}

interface EventInboxCardProps {
  item: InboxEventItem;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onClick: () => void;
  isFocused?: boolean;
}

function EventInboxCard({
  item,
  onMarkRead,
  onMarkUnread,
  onClick,
  isFocused = false,
}: EventInboxCardProps) {
  const { event, task, isUnread } = item;

  return (
    <button
      type="button"
      className={`flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-surface cursor-pointer w-full text-left ${
        isUnread ? '' : 'opacity-60'
      } ${isFocused ? 'ring-2 ring-accent bg-accent/10' : ''}`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!isUnread && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" />}
          <TruncatedText
            text={task.title}
            maxLength={50}
            className={`font-medium truncate ${
              isUnread ? 'text-foreground' : 'text-muted-foreground'
            }`}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip size="sm" variant="soft" color={getEventChipColor(event.type)} className="gap-1">
            {getEventIcon(event.type)}
            {getEventDescription(event)}
          </Chip>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(event.timestamp)}
          </span>
        </div>
      </div>

      <Tooltip>
        <Tooltip.Trigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={(e) => {
              e.continuePropagation?.();
              isUnread ? onMarkRead() : onMarkUnread();
            }}
            aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
          >
            {isUnread ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{isUnread ? 'Mark as read' : 'Mark as unread'}</Tooltip.Content>
      </Tooltip>
    </button>
  );
}

interface TaskInboxItemProps {
  task: TaskIndexEntry[string];
  isUnread: boolean;
  onApprove: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  isFocused?: boolean;
}

function TaskInboxItem({
  task,
  isUnread,
  onApprove,
  onMarkRead,
  onMarkUnread,
  isFocused = false,
}: TaskInboxItemProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 w-full py-2 px-2 rounded-lg ${
        isUnread ? '' : 'opacity-60'
      } ${isFocused ? 'ring-2 ring-accent bg-accent/10' : ''}`}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!isUnread && <EyeOff className="w-3 h-3 text-muted-foreground shrink-0" />}
          <TruncatedText
            text={task.title}
            maxLength={50}
            className={`font-medium truncate ${
              isUnread ? 'text-foreground' : 'text-muted-foreground'
            }`}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={task.status} />
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(task.lastUpdated)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {task.status === 'pending_review' && (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Approve task"
                onPress={onApprove}
                className="w-8 h-8"
              >
                <Check className="w-4 h-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Approve</Tooltip.Content>
          </Tooltip>
        )}

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
              onPress={isUnread ? onMarkRead : onMarkUnread}
              className="w-8 h-8"
            >
              {isUnread ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{isUnread ? 'Mark as read' : 'Mark as unread'}</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

interface AccordionSectionProps {
  id: string;
  icon: React.ReactNode;
  iconColorClass: string;
  title: string;
  count: number;
  chipColor: 'warning' | 'danger' | 'success' | 'default' | 'accent';
  children: React.ReactNode;
}

function AccordionSection({
  id,
  icon,
  iconColorClass,
  title,
  count,
  chipColor,
  children,
}: AccordionSectionProps) {
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

interface EventSectionListProps {
  events: InboxEventItem[];
  isEventFocused: (taskId: TaskId, eventId: string) => boolean;
  onMarkRead: (taskId: TaskId, eventId: string) => void;
  onMarkUnread: (taskId: TaskId, eventId: string) => void;
  onEventClick: (item: InboxEventItem) => void;
}

function EventSectionList({
  events,
  isEventFocused,
  onMarkRead,
  onMarkUnread,
  onEventClick,
}: EventSectionListProps) {
  return (
    <div className="divide-y divide-separator">
      {events.map((item) => (
        <EventInboxCard
          key={`${item.taskId}-${item.event.id}`}
          item={item}
          isFocused={isEventFocused(item.taskId, item.event.id)}
          onMarkRead={() => onMarkRead(item.taskId, item.event.id)}
          onMarkUnread={() => onMarkUnread(item.taskId, item.event.id)}
          onClick={() => onEventClick(item)}
        />
      ))}
    </div>
  );
}

interface DetailPanelSectionProps {
  isMobile: boolean;
  panelTaskId: string | null;
  panelWidth: PanelWidth;
  onClose: () => void;
  onExpand: () => void;
  onFullScreen: () => void;
  onChangeWidth: (width: PanelWidth) => void;
}

function DetailPanelSection({
  isMobile,
  panelTaskId,
  panelWidth,
  onClose,
  onExpand,
  onFullScreen,
  onChangeWidth,
}: DetailPanelSectionProps) {
  if (isMobile) {
    return (
      <TaskPanel
        taskId={panelTaskId}
        width={panelWidth}
        onClose={onClose}
        onChangeWidth={onChangeWidth}
        isMobile={true}
      >
        <InlineTaskDetail
          taskId={panelTaskId}
          onClose={onClose}
          onExpand={onExpand}
          onFullScreen={onFullScreen}
          width={panelWidth}
        />
      </TaskPanel>
    );
  }

  if (!panelTaskId) {
    return (
      <div className="flex flex-col h-full overflow-hidden items-center justify-center">
        <p className="text-muted-foreground">Select an item to view details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-separator">
      <InlineTaskDetail
        taskId={panelTaskId}
        onClose={onClose}
        onExpand={onExpand}
        onFullScreen={onFullScreen}
        width={panelWidth}
      />
    </div>
  );
}

function SignInRequired() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-foreground mb-2">Sign in to view your inbox</h1>
        <p className="text-sm text-muted-foreground">
          Connect your GitHub account to see notifications and pending items.
        </p>
      </div>
    </div>
  );
}

interface InboxZeroProps {
  showRead: boolean;
  onShowReadChange: (value: boolean) => void;
}

function InboxZero({ showRead, onShowReadChange }: InboxZeroProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-separator p-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground">All caught up!</p>
        </div>
        <Switch size="sm" isSelected={showRead} onChange={onShowReadChange}>
          {showRead ? 'Hide read' : 'Show read'}
        </Switch>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Inbox Zero!</h2>
          <p className="text-sm text-muted-foreground">No tasks need your attention right now.</p>
        </div>
      </div>
    </div>
  );
}

function expandPanelWidth(prev: PanelWidth): PanelWidth {
  if (prev === 'peek') return 'expanded';
  if (prev === 'expanded') return 'full';
  return prev;
}

function handleFocusedItemApprove(
  focusedItem: InboxNavigableItem | null,
  onApproveTask: (taskId: TaskId) => void,
  onOpenPanel: (taskId: string) => void
): void {
  if (!focusedItem) {
    toast.info('Use j/k to select an item first');
    return;
  }

  if (focusedItem.type === 'task' && focusedItem.canApprove) {
    onApproveTask(focusedItem.taskId);
    return;
  }

  if (
    focusedItem.type === 'task' ||
    focusedItem.type === 'event' ||
    focusedItem.type === 'request'
  ) {
    onOpenPanel(focusedItem.taskId);
  }
}

function handleFocusedItemDismiss(
  focusedItem: InboxNavigableItem | null,
  onMarkTaskAsRead: (taskId: TaskId) => void,
  onMarkEventAsRead: (taskId: TaskId, eventId: string) => void
): void {
  if (!focusedItem) {
    toast.info('Use j/k to select an item first');
    return;
  }

  if (focusedItem.type === 'task') {
    if (focusedItem.isUnread) {
      onMarkTaskAsRead(focusedItem.taskId);
      toast.success('Marked as read');
    } else {
      toast.info('Already marked as read');
    }
    return;
  }

  if (focusedItem.type === 'event') {
    if (focusedItem.isUnread) {
      onMarkEventAsRead(focusedItem.taskId, focusedItem.eventId);
      toast.success('Marked as read');
    } else {
      toast.info('Already marked as read');
    }
  }
}

export function InboxPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { identity: githubIdentity } = useGitHubAuth();
  const username = githubIdentity?.username ?? null;

  const roomHandle = useRoomHandle();
  const taskIndex = useTaskIndex();
  const inboxEvents = useInboxEvents();
  const tasksWithPendingRequests = useTasksWithPendingRequests();

  const [showRead, setShowRead] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState<PanelWidth>('peek');
  const [activeInputRequest, setActiveInputRequest] = useState<PendingRequestWithContext | null>(
    null
  );
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);

  const enrichedEvents = useMemo(
    () => enrichInboxEvents(inboxEvents, taskIndex, username),
    [inboxEvents, taskIndex, username]
  );

  const pendingReviewTasks = useMemo(
    () => computePendingReviewTasks(taskIndex, username),
    [taskIndex, username]
  );

  const pendingRequestsCount = tasksWithPendingRequests.length;
  const filteredEvents = useMemo(
    () => filterByReadState(enrichedEvents, showRead),
    [enrichedEvents, showRead]
  );
  const filteredTasks = useMemo(
    () => filterByReadState(pendingReviewTasks, showRead),
    [pendingReviewTasks, showRead]
  );

  const groupedEvents = useMemo(() => groupEventsByType(filteredEvents), [filteredEvents]);

  const navigableItems = useMemo(
    () => buildNavigableItems(tasksWithPendingRequests, filteredTasks, groupedEvents),
    [tasksWithPendingRequests, filteredTasks, groupedEvents]
  );

  const markEventAsRead = useCallback(
    (taskId: TaskId, eventId: string) =>
      markEventViewed(roomHandle.doc.taskIndex, taskId, eventId, username, true),
    [roomHandle.doc.taskIndex, username]
  );

  const markEventAsUnread = useCallback(
    (taskId: TaskId, eventId: string) =>
      markEventViewed(roomHandle.doc.taskIndex, taskId, eventId, username, false),
    [roomHandle.doc.taskIndex, username]
  );

  const markTaskAsRead = useCallback(
    (taskId: TaskId) => markTaskViewed(roomHandle.doc.taskIndex, taskId, username, true),
    [roomHandle.doc.taskIndex, username]
  );

  const markTaskAsUnread = useCallback(
    (taskId: TaskId) => markTaskViewed(roomHandle.doc.taskIndex, taskId, username, false),
    [roomHandle.doc.taskIndex, username]
  );

  const openTaskPanel = useCallback((taskId: string) => {
    setPanelTaskId(taskId);
    setPanelWidth('peek');
  }, []);
  const closeTaskPanel = useCallback(() => {
    setPanelTaskId(null);
  }, []);
  const expandPanel = useCallback(() => {
    setPanelWidth(expandPanelWidth);
  }, []);
  const goToFullTaskPage = useCallback(() => {
    if (panelTaskId) navigate(getTaskRoute(panelTaskId));
  }, [panelTaskId, navigate]);

  const handleApproveTask = useCallback(
    (taskId: TaskId) => {
      openTaskPanel(taskId);
    },
    [openTaskPanel]
  );

  const handleEventClick = useCallback(
    (item: InboxEventItem) => {
      if (item.isUnread) markEventAsRead(item.taskId, item.event.id);
      openTaskPanel(item.taskId);
    },
    [markEventAsRead, openTaskPanel]
  );

  const handleTaskSelect = useCallback(
    (keys: Set<unknown> | 'all') =>
      handleTaskSelectionChange(keys, setSelectedTaskId, openTaskPanel),
    [openTaskPanel]
  );

  const handleInputRequestClick = useCallback((request: PendingRequestWithContext) => {
    setActiveInputRequest(request);
    setIsInputModalOpen(true);
  }, []);
  const handleCloseInputModal = useCallback(() => {
    setIsInputModalOpen(false);
    setActiveInputRequest(null);
  }, []);

  const focusedItem = useMemo(
    () => getFocusedItem(focusedIndex, navigableItems),
    [focusedIndex, navigableItems]
  );

  const handleNextItem = useCallback(
    () => navigateToNextItem(navigableItems.length, setFocusedIndex),
    [navigableItems.length]
  );

  const handlePrevItem = useCallback(
    () => navigateToPrevItem(navigableItems.length, setFocusedIndex),
    [navigableItems.length]
  );

  const handleApprove = useCallback(() => {
    handleFocusedItemApprove(focusedItem, handleApproveTask, openTaskPanel);
  }, [focusedItem, handleApproveTask, openTaskPanel]);
  const handleDismiss = useCallback(() => {
    handleFocusedItemDismiss(focusedItem, markTaskAsRead, markEventAsRead);
  }, [focusedItem, markTaskAsRead, markEventAsRead]);

  useKeyboardShortcuts(
    useMemo(
      () => ({
        onNextItem: handleNextItem,
        onPrevItem: handlePrevItem,
        onApprove: handleApprove,
        onDismiss: handleDismiss,
      }),
      [handleNextItem, handlePrevItem, handleApprove, handleDismiss]
    )
  );

  const isTaskFocused = useCallback(
    (taskId: string): boolean =>
      focusedIndex >= 0 && focusedItem?.type === 'task' && focusedItem.taskId === taskId,
    [focusedIndex, focusedItem]
  );

  const isEventFocused = useCallback(
    (taskId: TaskId, eventId: string): boolean =>
      focusedIndex >= 0 &&
      focusedItem?.type === 'event' &&
      focusedItem.taskId === taskId &&
      focusedItem.eventId === eventId,
    [focusedIndex, focusedItem]
  );

  const totalItems =
    filteredTasks.length +
    groupedEvents.mentions.length +
    groupedEvents.inputRequests.length +
    groupedEvents.deliverablesFulfilled.length +
    groupedEvents.agentActivity.length +
    pendingRequestsCount;

  if (!username) return <SignInRequired />;
  if (totalItems === 0 && !showRead)
    return <InboxZero showRead={showRead} onShowReadChange={setShowRead} />;

  return (
    <div
      className={`h-full ${
        isMobile ? 'flex flex-col' : 'grid grid-cols-[minmax(300px,400px)_1fr]'
      }`}
    >
      <div
        className={`flex flex-col h-full overflow-hidden ${
          isMobile ? '' : 'border-r border-separator'
        }`}
      >
        <div className="border-b border-separator shrink-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-foreground">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                {totalItems} {totalItems === 1 ? 'item needs' : 'items need'} your attention
              </p>
            </div>
            <Switch size="sm" isSelected={showRead} onChange={setShowRead}>
              {showRead ? 'Hide read' : 'Show read'}
            </Switch>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <Kbd>j</Kbd>/<Kbd>k</Kbd> navigate
            </span>
            <span>
              <Kbd>Space</Kbd> open
            </span>
            <span>
              <Kbd>d</Kbd> dismiss
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <Accordion
            allowsMultipleExpanded
            defaultExpandedKeys={['pendingRequests', 'needsReview', 'mentions', 'agentActivity']}
          >
            {pendingRequestsCount > 0 && (
              <AccordionSection
                id="pendingRequests"
                icon={<MessageSquare className="w-4 h-4" />}
                iconColorClass="text-accent"
                title="Agent Input Needed"
                count={pendingRequestsCount}
                chipColor="accent"
              >
                <PendingRequestsSection onRequestClick={handleInputRequestClick} />
              </AccordionSection>
            )}

            {filteredTasks.length > 0 && (
              <AccordionSection
                id="needsReview"
                icon={<Clock className="w-4 h-4" />}
                iconColorClass="text-warning"
                title="Needs Review"
                count={filteredTasks.length}
                chipColor="warning"
              >
                <ListBox
                  aria-label="Tasks needing review"
                  selectionMode="single"
                  selectedKeys={selectedTaskId ? new Set([selectedTaskId]) : new Set()}
                  onSelectionChange={handleTaskSelect}
                  className="divide-y divide-separator"
                >
                  {filteredTasks.map(({ task, isUnread }) => (
                    <ListBoxItem
                      id={task.taskId}
                      key={task.taskId}
                      textValue={task.title}
                      className="px-3 rounded-lg hover:bg-surface data-[selected=true]:bg-accent/10 data-[selected=true]:border-l-4 data-[selected=true]:border-accent"
                    >
                      <TaskInboxItem
                        task={task}
                        isUnread={isUnread}
                        isFocused={isTaskFocused(task.taskId)}
                        onApprove={() => handleApproveTask(toTaskId(task.taskId))}
                        onMarkRead={() => markTaskAsRead(toTaskId(task.taskId))}
                        onMarkUnread={() => markTaskAsUnread(toTaskId(task.taskId))}
                      />
                    </ListBoxItem>
                  ))}
                </ListBox>
              </AccordionSection>
            )}

            {groupedEvents.mentions.length > 0 && (
              <AccordionSection
                id="mentions"
                icon={<AtSign className="w-4 h-4" />}
                iconColorClass="text-accent"
                title="Comments"
                count={groupedEvents.mentions.length}
                chipColor="accent"
              >
                <EventSectionList
                  events={groupedEvents.mentions}
                  isEventFocused={isEventFocused}
                  onMarkRead={markEventAsRead}
                  onMarkUnread={markEventAsUnread}
                  onEventClick={handleEventClick}
                />
              </AccordionSection>
            )}

            {groupedEvents.inputRequests.length > 0 && (
              <AccordionSection
                id="inputRequests"
                icon={<AtSign className="w-4 h-4" />}
                iconColorClass="text-warning"
                title="Input Requests"
                count={groupedEvents.inputRequests.length}
                chipColor="warning"
              >
                <EventSectionList
                  events={groupedEvents.inputRequests}
                  isEventFocused={isEventFocused}
                  onMarkRead={markEventAsRead}
                  onMarkUnread={markEventAsUnread}
                  onEventClick={handleEventClick}
                />
              </AccordionSection>
            )}

            {groupedEvents.deliverablesFulfilled.length > 0 && (
              <AccordionSection
                id="deliverablesFulfilled"
                icon={<CheckCircle className="w-4 h-4" />}
                iconColorClass="text-success"
                title="Ready to Complete"
                count={groupedEvents.deliverablesFulfilled.length}
                chipColor="success"
              >
                <EventSectionList
                  events={groupedEvents.deliverablesFulfilled}
                  isEventFocused={isEventFocused}
                  onMarkRead={markEventAsRead}
                  onMarkUnread={markEventAsUnread}
                  onEventClick={handleEventClick}
                />
              </AccordionSection>
            )}

            {groupedEvents.agentActivity.length > 0 && (
              <AccordionSection
                id="agentActivity"
                icon={<FileText className="w-4 h-4" />}
                iconColorClass="text-default"
                title="Agent Activity"
                count={groupedEvents.agentActivity.length}
                chipColor="default"
              >
                <EventSectionList
                  events={groupedEvents.agentActivity}
                  isEventFocused={isEventFocused}
                  onMarkRead={markEventAsRead}
                  onMarkUnread={markEventAsUnread}
                  onEventClick={handleEventClick}
                />
              </AccordionSection>
            )}

            {groupedEvents.other.length > 0 && (
              <AccordionSection
                id="other"
                icon={<MessageSquare className="w-4 h-4" />}
                iconColorClass="text-muted-foreground"
                title="Other"
                count={groupedEvents.other.length}
                chipColor="default"
              >
                <EventSectionList
                  events={groupedEvents.other}
                  isEventFocused={isEventFocused}
                  onMarkRead={markEventAsRead}
                  onMarkUnread={markEventAsUnread}
                  onEventClick={handleEventClick}
                />
              </AccordionSection>
            )}
          </Accordion>
        </div>
      </div>

      <DetailPanelSection
        isMobile={isMobile}
        panelTaskId={panelTaskId}
        panelWidth={panelWidth}
        onClose={closeTaskPanel}
        onExpand={expandPanel}
        onFullScreen={goToFullTaskPage}
        onChangeWidth={setPanelWidth}
      />

      {activeInputRequest && (
        <AnyInputRequestModal
          isOpen={isInputModalOpen}
          request={activeInputRequest}
          taskId={activeInputRequest.taskId}
          onClose={handleCloseInputModal}
        />
      )}
    </div>
  );
}
