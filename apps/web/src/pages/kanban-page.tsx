import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Card, Chip, Tooltip } from '@heroui/react';
import {
  isTaskStatus,
  TASK_STATUSES,
  type TaskId,
  type TaskStatus,
  toTaskId,
} from '@shipyard/loro-schema';
import {
  Check,
  CheckSquare,
  Circle,
  CircleDot,
  Clock,
  Eye,
  EyeOff,
  GitPullRequest,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { InlineTaskDetail } from '@/components/task/inline-task-detail';
import { type PanelWidth, TaskPanel } from '@/components/task/task-panel';
import { Avatar } from '@/components/ui/avatar';
import { KanbanSkeleton } from '@/components/ui/kanban-skeleton';
import { getTaskRoute } from '@/constants/routes';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useLocalIdentity } from '@/hooks/use-local-identity';
import { useTaskIndex } from '@/loro/selectors/room-selectors';
import { useTaskDeliverables, useTaskLinkedPRs } from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';
import { formatRelativeTime } from '@/utils/formatters';

type ColumnId = 'draft' | 'pending_review' | 'changes_requested' | 'in_progress' | 'completed';

interface TaskIndexEntryShape {
  taskId: string;
  title: string;
  status: string;
  ownerId: string;
  hasPendingRequests: boolean;
  lastUpdated: number;
  createdAt: number;
}

function isTaskIndexEntry(value: unknown): value is TaskIndexEntryShape {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.taskId === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.ownerId === 'string' &&
    typeof obj.hasPendingRequests === 'boolean' &&
    typeof obj.lastUpdated === 'number' &&
    typeof obj.createdAt === 'number'
  );
}

interface ColumnConfig {
  id: ColumnId;
  label: string;
  color: 'default' | 'warning' | 'danger' | 'accent' | 'success';
  icon: typeof Circle;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { id: 'draft', label: 'Draft', color: 'default', icon: Circle },
  {
    id: 'pending_review',
    label: 'Pending Review',
    color: 'warning',
    icon: Clock,
  },
  {
    id: 'changes_requested',
    label: 'Changes Requested',
    color: 'danger',
    icon: X,
  },
  { id: 'in_progress', label: 'In Progress', color: 'accent', icon: CircleDot },
  { id: 'completed', label: 'Completed', color: 'success', icon: Check },
];

interface TaskWithId {
  taskId: TaskId;
  title: string;
  status: TaskStatus;
  ownerId: string;
  hasPendingRequests: boolean;
  lastUpdated: number;
  createdAt: number;
}

function isTaskWithId(value: unknown): value is TaskWithId {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.taskId === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.status === 'string' &&
    isTaskStatus(obj.status) &&
    typeof obj.ownerId === 'string' &&
    typeof obj.hasPendingRequests === 'boolean' &&
    typeof obj.lastUpdated === 'number' &&
    typeof obj.createdAt === 'number'
  );
}

function isColumnId(value: string): value is ColumnId {
  return TASK_STATUSES.includes(value as TaskStatus);
}

function createEmptyGroupedTasks(): Record<ColumnId, TaskWithId[]> {
  return {
    draft: [],
    pending_review: [],
    changes_requested: [],
    in_progress: [],
    completed: [],
  };
}

function convertToTaskWithId(taskId: string, entry: TaskIndexEntryShape): TaskWithId {
  return {
    taskId: toTaskId(taskId),
    title: entry.title,
    status: entry.status as TaskStatus,
    ownerId: entry.ownerId,
    hasPendingRequests: entry.hasPendingRequests,
    lastUpdated: entry.lastUpdated,
    createdAt: entry.createdAt,
  };
}

function addTaskToColumn(
  grouped: Record<ColumnId, TaskWithId[]>,
  taskId: string,
  entry: TaskIndexEntryShape
): void {
  if (!isTaskIndexEntry(entry)) return;
  if (!isTaskStatus(entry.status)) return;

  const task = convertToTaskWithId(taskId, entry);
  const column = grouped[entry.status];
  if (column) {
    column.push(task);
  }
}

function sortTasksByLastUpdated(grouped: Record<ColumnId, TaskWithId[]>): void {
  for (const tasks of Object.values(grouped)) {
    tasks.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }
}

function useGroupedTasks(): Record<ColumnId, TaskWithId[]> {
  const taskIndex = useTaskIndex();

  return useMemo(() => {
    const grouped = createEmptyGroupedTasks();

    if (!taskIndex || typeof taskIndex !== 'object') {
      return grouped;
    }

    for (const [taskId, entry] of Object.entries(taskIndex)) {
      addTaskToColumn(grouped, taskId, entry as TaskIndexEntryShape);
    }

    sortTasksByLastUpdated(grouped);
    return grouped;
  }, [taskIndex]);
}

function getStatusBorderColor(status: TaskStatus): string {
  switch (status) {
    case 'draft':
      return 'border-l-gray-500';
    case 'pending_review':
      return 'border-l-warning';
    case 'changes_requested':
      return 'border-l-danger';
    case 'in_progress':
      return 'border-l-accent';
    case 'completed':
      return 'border-l-success';
    default:
      return 'border-l-gray-500';
  }
}

interface KanbanCardContentProps {
  task: TaskWithId;
}

function KanbanCardContent({ task }: KanbanCardContentProps) {
  const deliverables = useTaskDeliverables(task.taskId);
  const linkedPRs = useTaskLinkedPRs(task.taskId);

  const deliverableArray = useMemo(() => {
    return Array.isArray(deliverables) ? deliverables : [];
  }, [deliverables]);

  const prArray = useMemo(() => {
    return Array.isArray(linkedPRs) ? linkedPRs : [];
  }, [linkedPRs]);

  const completedDeliverables = deliverableArray.filter((d) => d.linkedArtifactId).length;
  const totalDeliverables = deliverableArray.length;
  const hasDeliverables = totalDeliverables > 0;
  const hasPRs = prArray.length > 0;
  const borderColorClass = getStatusBorderColor(task.status);

  return (
    <Card
      variant="secondary"
      className={`
				transition-all duration-150 pointer-events-none
				border-l-3 ${borderColorClass}
				shadow-md
			`}
    >
      <Card.Header className="p-4">
        {task.title.length > 30 ? (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Card.Title
                className="text-base font-semibold leading-snug cursor-default"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {task.title}
              </Card.Title>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-md">{task.title}</Tooltip.Content>
          </Tooltip>
        ) : (
          <Card.Title
            className="text-base font-semibold leading-snug"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {task.title}
          </Card.Title>
        )}
      </Card.Header>

      <Card.Content className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          {task.ownerId && (
            <div className="flex items-center gap-1 bg-surface-hover/60 rounded-full px-1.5 py-0.5">
              <Avatar size="sm" className="w-4 h-4">
                <Avatar.Image
                  src={`https://github.com/${task.ownerId}.png?size=32`}
                  alt={task.ownerId}
                />
                <Avatar.Fallback className="text-[8px]">
                  {task.ownerId.slice(0, 2).toUpperCase()}
                </Avatar.Fallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground truncate max-w-[60px]">
                {task.ownerId}
              </span>
            </div>
          )}

          {hasPRs && (
            <Chip size="sm" variant="soft" color="accent" className="gap-1">
              <GitPullRequest className="w-3 h-3" />
              <span>{prArray.length > 1 ? prArray.length : ''}</span>
            </Chip>
          )}

          {hasDeliverables && (
            <Chip
              size="sm"
              variant="soft"
              color={completedDeliverables === totalDeliverables ? 'success' : 'default'}
              className="gap-1"
            >
              <CheckSquare className="w-3 h-3" />
              <span>
                {completedDeliverables}/{totalDeliverables}
              </span>
            </Chip>
          )}
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Updated {formatRelativeTime(task.lastUpdated)}
        </div>
      </Card.Content>
    </Card>
  );
}

interface SortableKanbanCardProps {
  task: TaskWithId;
  onCardClick: (taskId: TaskId) => void;
}

function SortableKanbanCard({ task, onCardClick }: SortableKanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.taskId,
    data: {
      type: 'task',
      task,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    onCardClick(task.taskId);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    >
      <div
        className={`
				transition-all duration-150
				hover:translate-y-[-2px] hover:shadow-lg
				${isDragging ? 'shadow-xl ring-2 ring-accent' : ''}
			`}
      >
        <KanbanCardContent task={task} />
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  config: ColumnConfig;
  tasks: TaskWithId[];
  onCardClick: (taskId: TaskId) => void;
}

function KanbanColumn({ config, tasks, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: config.id,
    data: {
      type: 'column',
      status: config.id,
    },
  });

  const taskIds = tasks.map((t) => t.taskId);
  const Icon = config.icon;

  return (
    <div
      ref={setNodeRef}
      className={`
				flex-shrink-0 w-72 bg-surface rounded-lg flex flex-col max-h-full
				transition-colors
				${isOver ? 'ring-2 ring-accent ring-opacity-50 bg-accent/5' : ''}
			`}
    >
      <header className="flex items-center gap-2 p-3 border-b border-separator">
        <Chip size="sm" variant="soft" color={config.color}>
          <Icon className="w-3 h-3" />
          {config.label}
        </Chip>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </header>

      <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[100px]">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
              No tasks
            </div>
          ) : (
            tasks.map((task) => (
              <SortableKanbanCard key={task.taskId} task={task} onCardClick={onCardClick} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

interface TaskStatusUpdaterProps {
  taskId: TaskId;
  newStatus: TaskStatus;
  userId: string;
  onComplete: () => void;
}

function extractTargetStatusFromColumn(over: { id: string | number }): ColumnId | null {
  const columnId = String(over.id);
  return isColumnId(columnId) ? columnId : null;
}

function extractTargetStatusFromTask(overData: { task?: unknown } | undefined): ColumnId | null {
  const overTaskData = overData?.task;
  return isTaskWithId(overTaskData) ? overTaskData.status : null;
}

function extractTargetStatus(over: {
  data: { current?: { type?: string; task?: unknown } };
  id: string | number;
}): ColumnId | null {
  if (over.data.current?.type === 'column') {
    return extractTargetStatusFromColumn(over);
  }
  if (over.data.current?.type === 'task') {
    return extractTargetStatusFromTask(over.data.current);
  }
  return null;
}

function TaskStatusUpdater({ taskId, newStatus, userId, onComplete }: TaskStatusUpdaterProps) {
  const taskDoc = useTaskDocument(taskId);
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;
    taskDoc.updateStatus(newStatus, userId);
    onComplete();
  }, [taskDoc, newStatus, userId, onComplete]);

  return null;
}

export function KanbanPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { identity: githubIdentity } = useGitHubAuth();
  const { localIdentity } = useLocalIdentity();
  const groupedTasks = useGroupedTasks();

  const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskWithId | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{
    taskId: TaskId;
    newStatus: TaskStatus;
  } | null>(null);

  // Panel state for inline task viewing
  const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState<PanelWidth>('peek');

  const userId = githubIdentity?.username ?? localIdentity?.username ?? 'anonymous';

  const visibleColumns = useMemo(() => {
    if (hideEmptyColumns) {
      return COLUMN_CONFIGS.filter((config) => {
        const tasks = groupedTasks[config.id];
        return tasks && tasks.length > 0;
      });
    }
    return COLUMN_CONFIGS;
  }, [groupedTasks, hideEmptyColumns]);

  const allTasks = useMemo(() => {
    return Object.values(groupedTasks).flat();
  }, [groupedTasks]);

  const totalTasks = allTasks.length;
  const isLoading = totalTasks === 0 && Object.keys(groupedTasks).length === 0;

  const handleToggleEmptyColumns = useCallback(() => {
    setHideEmptyColumns((prev) => !prev);
  }, []);

  /** Open task in slide-out panel */
  const openTaskPanel = useCallback((taskId: TaskId) => {
    setPanelTaskId(taskId);
    setPanelWidth('peek');
  }, []);

  /** Close the task panel */
  const closeTaskPanel = useCallback(() => {
    setPanelTaskId(null);
  }, []);

  /** Expand panel to next size (peek -> expanded -> full) */
  const expandPanel = useCallback(() => {
    setPanelWidth((prev) => {
      if (prev === 'peek') return 'expanded';
      if (prev === 'expanded') return 'full';
      return prev;
    });
  }, []);

  /** Navigate to full task page */
  const goToFullTaskPage = useCallback(() => {
    if (panelTaskId) {
      navigate(getTaskRoute(panelTaskId));
    }
  }, [panelTaskId, navigate]);

  const handleCardClick = useCallback(
    (taskId: TaskId) => {
      // Open panel instead of navigating
      openTaskPanel(taskId);
    },
    [openTaskPanel]
  );

  const handleUpdateComplete = useCallback(() => {
    if (pendingUpdate) {
      toast.success(`Moved to ${pendingUpdate.newStatus.replace('_', ' ')}`);
    }
    setPendingUpdate(null);
  }, [pendingUpdate]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const announcements: Announcements = {
    onDragStart({ active }: { active: { data: { current?: { task?: TaskWithId } } } }) {
      const task = active.data.current?.task;
      return `Picked up task: ${task?.title ?? 'unknown'}`;
    },
    onDragOver({
      active,
      over,
    }: {
      active: { data: { current?: { task?: TaskWithId } } };
      over: {
        data: { current?: { status?: string } };
        id: string | number;
      } | null;
    }) {
      const task = active.data.current?.task;
      if (over) {
        const status = String(over.data.current?.status ?? over.id);
        return `Task ${task?.title ?? 'unknown'} is over ${status.replace('_', ' ')} column`;
      }
      return `Task ${task?.title ?? 'unknown'} is no longer over a droppable area`;
    },
    onDragEnd({
      active,
      over,
    }: {
      active: { data: { current?: { task?: TaskWithId } } };
      over: {
        data: { current?: { status?: string } };
        id: string | number;
      } | null;
    }) {
      const task = active.data.current?.task;
      if (over) {
        const status = String(over.data.current?.status ?? over.id);
        return `Task ${task?.title ?? 'unknown'} was moved to ${status.replace('_', ' ')} column`;
      }
      return `Drag cancelled for task: ${task?.title ?? 'unknown'}`;
    },
    onDragCancel({ active }: { active: { data: { current?: { task?: TaskWithId } } } }) {
      const task = active.data.current?.task;
      return `Dragging was cancelled. Task ${task?.title ?? 'unknown'} was not moved.`;
    },
  };

  const handleDragStart = (event: DragStartEvent) => {
    const taskData = event.active.data.current?.task;
    if (isTaskWithId(taskData)) {
      setActiveTask(taskData);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const taskData = active.data.current?.task;
    if (!isTaskWithId(taskData)) return;

    const targetStatus = extractTargetStatus(over);
    if (!targetStatus) return;
    if (taskData.status === targetStatus) return;

    setPendingUpdate({
      taskId: taskData.taskId,
      newStatus: targetStatus,
    });
  };

  const handleDragCancel = () => {
    setActiveTask(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-separator shrink-0">
          <div>
            <h1 className="text-xl font-bold text-foreground">Board</h1>
            <p className="text-sm text-muted-foreground">Loading tasks...</p>
          </div>
        </header>
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <KanbanSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-separator shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Board</h1>
          <p className="text-sm text-muted-foreground">
            {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} across {visibleColumns.length}{' '}
            {visibleColumns.length === 1 ? 'column' : 'columns'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onPress={handleToggleEmptyColumns}
                className={hideEmptyColumns ? 'text-accent' : ''}
              >
                {hideEmptyColumns ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{hideEmptyColumns ? 'Show' : 'Hide'} empty columns</Tooltip.Content>
          </Tooltip>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{ announcements }}
        >
          <div className="flex gap-4 p-4 h-full min-w-min">
            {visibleColumns.map((config) => (
              <KanbanColumn
                key={config.id}
                config={config}
                tasks={groupedTasks[config.id] ?? []}
                onCardClick={handleCardClick}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="opacity-90">
                <KanbanCardContent task={activeTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {pendingUpdate && (
        <TaskStatusUpdater
          taskId={pendingUpdate.taskId}
          newStatus={pendingUpdate.newStatus}
          userId={userId}
          onComplete={handleUpdateComplete}
        />
      )}

      {/* Slide-out task panel */}
      <TaskPanel
        taskId={panelTaskId}
        width={panelWidth}
        onClose={closeTaskPanel}
        onChangeWidth={setPanelWidth}
        isMobile={isMobile}
      >
        <InlineTaskDetail
          taskId={panelTaskId}
          onClose={closeTaskPanel}
          onExpand={expandPanel}
          onFullScreen={goToFullTaskPage}
          width={panelWidth}
        />
      </TaskPanel>
    </div>
  );
}
