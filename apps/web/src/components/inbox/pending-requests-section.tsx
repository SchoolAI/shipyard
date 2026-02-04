/**
 * Component to display pending input requests in the inbox.
 * Uses separate components per task to properly handle the hook rules
 * (each task's input requests come from a separate Loro document).
 */

import type { TaskId } from '@shipyard/loro-schema';
import { toTaskId } from '@shipyard/loro-schema';
import { MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputRequestInboxItem } from '@/components/input-request-inbox-item';
import type { AnyInputRequest } from '@/components/input-request-types';
import { getTaskRoute } from '@/constants/routes';
import { useTasksWithPendingRequests } from '@/loro/selectors/room-selectors';
import { useTaskInputRequests, useTaskMeta } from '@/loro/selectors/task-selectors';

/** Input request with task context for the inbox */
type PendingRequestWithContext = AnyInputRequest & {
  taskId: TaskId;
  taskTitle: string;
};

interface TaskPendingRequestsProps {
  taskId: TaskId;
  onRequestClick: (request: PendingRequestWithContext) => void;
}

/**
 * Component that fetches and renders input requests for a single task.
 * This allows us to call useTaskInputRequests hook properly (once per task).
 */
function TaskPendingRequests({ taskId, onRequestClick }: TaskPendingRequestsProps) {
  const inputRequests = useTaskInputRequests(taskId);
  const meta = useTaskMeta(taskId);

  const pendingRequests = useMemo(() => {
    if (!meta || meta.status === 'completed' || meta.archivedAt) {
      return [];
    }

    return inputRequests
      .filter((r) => r.status === 'pending')
      .filter((r) => Date.now() < r.expiresAt)
      .map((r) => ({
        ...r,
        taskId,
        taskTitle: meta.title,
      }));
  }, [inputRequests, meta, taskId]);

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <>
      {pendingRequests.map((request) => (
        <InputRequestInboxItem
          key={request.id}
          request={request}
          taskId={taskId}
          taskTitle={request.taskTitle}
          onClick={() => onRequestClick(request)}
        />
      ))}
    </>
  );
}

interface PendingRequestsSectionProps {
  /** Called when a request is clicked with the request and task context */
  onRequestClick?: (request: PendingRequestWithContext) => void;
}

/**
 * Section component that aggregates and displays all pending input requests
 * across all tasks that have pending requests.
 */
export function PendingRequestsSection({ onRequestClick }: PendingRequestsSectionProps) {
  const navigate = useNavigate();
  const tasksWithPendingRequests = useTasksWithPendingRequests();

  const handleRequestClick = (request: PendingRequestWithContext) => {
    if (onRequestClick) {
      onRequestClick(request);
    } else {
      // Default behavior: navigate to the task page
      navigate(getTaskRoute(request.taskId));
    }
  };

  if (tasksWithPendingRequests.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 px-3">
      {tasksWithPendingRequests.map((taskEntry) => (
        <TaskPendingRequests
          key={taskEntry.taskId}
          taskId={toTaskId(taskEntry.taskId)}
          onRequestClick={handleRequestClick}
        />
      ))}
    </div>
  );
}

/**
 * Hook to get the count of pending requests across all tasks.
 * This is a lightweight version that doesn't fetch the actual request data.
 */
export function usePendingRequestsCount(): number {
  const tasksWithPendingRequests = useTasksWithPendingRequests();
  return tasksWithPendingRequests.length;
}

export function PendingRequestsIcon() {
  return <MessageSquare className="w-4 h-4" />;
}

export type { PendingRequestWithContext };
