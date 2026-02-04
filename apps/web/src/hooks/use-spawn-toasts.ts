import type { TaskEventItem, TaskId } from '@shipyard/loro-schema';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTaskEvents } from '@/loro/selectors/task-selectors';

type SpawnRequestedEvent = Extract<TaskEventItem, { type: 'spawn_requested' }>;
type SpawnStartedEvent = Extract<TaskEventItem, { type: 'spawn_started' }>;
type SpawnCompletedEvent = Extract<TaskEventItem, { type: 'spawn_completed' }>;
type SpawnFailedEvent = Extract<TaskEventItem, { type: 'spawn_failed' }>;

type SpawnEvent = SpawnRequestedEvent | SpawnStartedEvent | SpawnCompletedEvent | SpawnFailedEvent;

function isSpawnEvent(event: TaskEventItem): event is SpawnEvent {
  return (
    event.type === 'spawn_requested' ||
    event.type === 'spawn_started' ||
    event.type === 'spawn_completed' ||
    event.type === 'spawn_failed'
  );
}

function getSpawnEventKey(event: SpawnEvent): string {
  if (event.type === 'spawn_requested') {
    return `${event.type}-${event.id}`;
  }
  return `${event.type}-${event.requestId}`;
}

function showSpawnRequestedToast(event: SpawnRequestedEvent): void {
  const truncatedPrompt = event.prompt.slice(0, 50);
  const ellipsis = event.prompt.length > 50 ? '...' : '';
  toast.info('Agent spawn requested', {
    description: `Prompt: ${truncatedPrompt}${ellipsis}`,
  });
}

function showSpawnCompletedToast(event: SpawnCompletedEvent): void {
  if (event.exitCode === 0) {
    toast.success('Agent completed successfully', {
      description: 'Exit code: 0',
    });
  } else {
    toast.warning('Agent exited', {
      description: `Exit code: ${event.exitCode}`,
    });
  }
}

function showSpawnToast(event: SpawnEvent): void {
  switch (event.type) {
    case 'spawn_requested':
      showSpawnRequestedToast(event);
      break;
    case 'spawn_started':
      toast.success('Agent started', {
        description: `Process ID: ${event.pid}`,
      });
      break;
    case 'spawn_completed':
      showSpawnCompletedToast(event);
      break;
    case 'spawn_failed':
      toast.error('Agent spawn failed', { description: event.error });
      break;
  }
}

interface UseSpawnToastsOptions {
  taskId: TaskId;
  /** If true, only shows toasts for events created after the hook mounts */
  onlyNewEvents?: boolean;
}

/**
 * Hook that subscribes to spawn events for a task and shows toast notifications.
 *
 * Shows toasts for:
 * - spawn_requested: "Agent spawn requested"
 * - spawn_started: "Agent started (PID: xxx)"
 * - spawn_completed: "Agent completed (exit code: x)"
 * - spawn_failed: "Agent spawn failed: error message"
 */
export function useSpawnToasts({ taskId, onlyNewEvents = true }: UseSpawnToastsOptions): void {
  const events = useTaskEvents(taskId);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const mountTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // Reset processed events when taskId changes
    processedEventsRef.current = new Set();
    mountTimeRef.current = Date.now();
  }, [taskId]);

  useEffect(() => {
    const spawnEvents = events.filter(isSpawnEvent);

    for (const event of spawnEvents) {
      const key = getSpawnEventKey(event);

      if (processedEventsRef.current.has(key)) continue;

      const isOldEvent = onlyNewEvents && event.timestamp < mountTimeRef.current;
      processedEventsRef.current.add(key);
      if (isOldEvent) continue;

      showSpawnToast(event);
    }
  }, [events, onlyNewEvents]);
}
