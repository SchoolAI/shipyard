import { Button, Description, Label, ListBox } from '@heroui/react';
import { type TaskId, toTaskId } from '@shipyard/loro-schema';
import { ArchiveRestore } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TagChip } from '@/components/tag-chip';
import { useTaskIndex } from '@/loro/selectors/room-selectors';
import { useIsTaskArchived, useTaskArchivedAt, useTaskMeta } from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';
import { formatRelativeTime } from '@/utils/formatters';

interface ArchivedTaskItemProps {
  taskId: TaskId;
  isSelected: boolean;
}

function ArchivedTaskItem({ taskId, isSelected }: ArchivedTaskItemProps) {
  const isArchived = useIsTaskArchived(taskId);
  const meta = useTaskMeta(taskId);
  const archivedAt = useTaskArchivedAt(taskId);
  const taskDoc = useTaskDocument(taskId);

  if (!isArchived) {
    return null;
  }

  const handleUnarchive = () => {
    const actor = meta.ownerId || 'unknown';
    taskDoc.meta.archivedAt = null;
    taskDoc.meta.archivedBy = null;
    taskDoc.logEvent('task_unarchived', actor, {});
  };

  return (
    <ListBox.Item
      id={taskId}
      textValue={meta.title}
      className={`px-3 py-2 rounded-lg ${isSelected ? 'bg-surface-secondary' : 'hover:bg-surface'}`}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <Label className="font-medium text-foreground truncate opacity-70">{meta.title}</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Description className="text-xs text-muted-foreground">
              Archived {formatRelativeTime(archivedAt ?? meta.updatedAt)}
            </Description>
            {meta.tags.length > 0 && (
              <div className="flex gap-1 items-center">
                {meta.tags.slice(0, 3).map((tag) => (
                  <TagChip key={tag} tag={tag} size="sm" />
                ))}
                {meta.tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{meta.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Unarchive task"
          onPress={handleUnarchive}
          className="w-8 h-8 shrink-0"
        >
          <ArchiveRestore className="w-4 h-4" />
        </Button>
      </div>
    </ListBox.Item>
  );
}

function TaskArchiveChecker({
  taskId,
  onArchiveStatus,
}: {
  taskId: TaskId;
  onArchiveStatus: (taskId: TaskId, isArchived: boolean) => void;
}) {
  const isArchived = useIsTaskArchived(taskId);
  useEffect(() => {
    onArchiveStatus(taskId, isArchived);
  }, [taskId, isArchived, onArchiveStatus]);
  return null;
}

export function ArchivePage() {
  const taskIndex = useTaskIndex();
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);
  const [archivedTaskIds, setArchivedTaskIds] = useState<Set<TaskId>>(new Set());

  const taskIds = useMemo(() => {
    return Object.keys(taskIndex).map(toTaskId);
  }, [taskIndex]);

  const handleArchiveStatus = useCallback((taskId: TaskId, isArchived: boolean) => {
    setArchivedTaskIds((prev) => {
      const next = new Set(prev);
      if (isArchived) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const handleSelectionChange = (keys: Set<unknown> | 'all') => {
    if (keys === 'all') return;
    const key = Array.from(keys)[0];
    setSelectedTaskId(key ? toTaskId(String(key)) : null);
  };

  const archivedCount = archivedTaskIds.size;

  if (taskIds.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <ArchiveRestore className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">No Archived Tasks</h1>
          <p className="text-sm text-muted-foreground">Your archived tasks will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {taskIds.map((taskId) => (
        <TaskArchiveChecker key={taskId} taskId={taskId} onArchiveStatus={handleArchiveStatus} />
      ))}

      <div className="border-b border-separator shrink-0 p-4">
        <div className="mb-1">
          <h1 className="text-xl font-bold text-foreground">Archive</h1>
          <p className="text-sm text-muted-foreground">
            {archivedCount} {archivedCount === 1 ? 'archived task' : 'archived tasks'}
          </p>
        </div>
      </div>

      {archivedCount === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <ArchiveRestore className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">No Archived Tasks</h1>
            <p className="text-sm text-muted-foreground">Your archived tasks will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <ListBox
            aria-label="Archived tasks"
            selectionMode="single"
            selectedKeys={selectedTaskId ? new Set([selectedTaskId]) : new Set()}
            onSelectionChange={handleSelectionChange}
            className="divide-y divide-separator"
          >
            {taskIds.map((taskId) => (
              <ArchivedTaskItem
                key={taskId}
                taskId={taskId}
                isSelected={selectedTaskId === taskId}
              />
            ))}
          </ListBox>
        </div>
      )}
    </div>
  );
}
