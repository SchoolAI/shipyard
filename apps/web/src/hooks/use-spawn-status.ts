import { type TaskEventItem, type TaskId, toTaskId } from '@shipyard/loro-schema';
import { useMemo } from 'react';
import { useTaskEvents } from '@/loro/selectors/task-selectors';

export type SpawnPhase = 'idle' | 'requested' | 'started' | 'completed' | 'failed';

export interface SpawnStatus {
  phase: SpawnPhase;
  pid?: number;
  exitCode?: number;
  /** Signal that terminated the process (e.g., 'SIGTERM', 'SIGKILL') */
  signal?: string | null;
  /** First 1KB of stderr output for debugging */
  stderr?: string | null;
  error?: string;
  timestamp?: number;
}

type SpawnRequestedEvent = Extract<TaskEventItem, { type: 'spawn_requested' }>;
type SpawnStartedEvent = Extract<TaskEventItem, { type: 'spawn_started' }>;
type SpawnCompletedEvent = Extract<TaskEventItem, { type: 'spawn_completed' }>;
type SpawnFailedEvent = Extract<TaskEventItem, { type: 'spawn_failed' }>;

interface SpawnEvents {
  requested?: SpawnRequestedEvent;
  started?: SpawnStartedEvent;
  completed?: SpawnCompletedEvent;
  failed?: SpawnFailedEvent;
}

function findSpawnEvents(events: TaskEventItem[], requestId: string): SpawnEvents {
  const result: SpawnEvents = {};

  for (const event of events) {
    if (event.type === 'spawn_requested' && event.id === requestId) {
      result.requested = event;
    } else if (event.type === 'spawn_started' && event.requestId === requestId) {
      result.started = event;
    } else if (event.type === 'spawn_completed' && event.requestId === requestId) {
      result.completed = event;
    } else if (event.type === 'spawn_failed' && event.requestId === requestId) {
      result.failed = event;
    }
  }

  return result;
}

function deriveStatus(spawnEvents: SpawnEvents): SpawnStatus {
  const { requested, started, completed, failed } = spawnEvents;

  if (failed) {
    return {
      phase: 'failed',
      error: failed.error,
      stderr: failed.stderr,
      timestamp: failed.timestamp,
    };
  }

  if (completed) {
    return {
      phase: 'completed',
      pid: started?.pid,
      exitCode: completed.exitCode,
      signal: completed.signal,
      stderr: completed.stderr,
      timestamp: completed.timestamp,
    };
  }

  if (started) {
    return {
      phase: 'started',
      pid: started.pid,
      timestamp: started.timestamp,
    };
  }

  if (requested) {
    return {
      phase: 'requested',
      timestamp: requested.timestamp,
    };
  }

  return { phase: 'idle' };
}

export function useSpawnStatus(taskId: TaskId | null, requestId: string | null): SpawnStatus {
  const events = useTaskEvents(taskId ?? toTaskId('task_placeholder'));

  return useMemo(() => {
    if (!taskId || !requestId) {
      return { phase: 'idle' };
    }

    const spawnEvents = findSpawnEvents(events, requestId);
    return deriveStatus(spawnEvents);
  }, [taskId, events, requestId]);
}

export function useLatestSpawnStatus(taskId: TaskId): SpawnStatus & { requestId?: string } {
  const events = useTaskEvents(taskId);

  return useMemo(() => {
    let latestRequest: SpawnRequestedEvent | null = null;

    for (const event of events) {
      if (event.type === 'spawn_requested') {
        if (!latestRequest || event.timestamp > latestRequest.timestamp) {
          latestRequest = event;
        }
      }
    }

    if (!latestRequest) {
      return { phase: 'idle' };
    }

    const spawnEvents = findSpawnEvents(events, latestRequest.id);
    const status = deriveStatus(spawnEvents);

    return { ...status, requestId: latestRequest.id };
  }, [events]);
}
