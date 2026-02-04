/**
 * Loro event handlers.
 *
 * Watches Loro doc events and triggers actions:
 * - spawn_requested -> spawn Claude Code agent
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import type { Handle } from '@loro-extended/repo';
import type { TaskDocumentShape, TaskEvent } from '@shipyard/loro-schema';
import { trackAgent } from '../agents/tracker.js';
import { getMachineId, getMachineName } from '../utils/identity.js';
import { logger } from '../utils/logger.js';
import { startGitSync } from './git-sync.js';

/**
 * Single event item type from TaskEvent array.
 * TaskEvent is the full array type, so we extract the element type.
 */
type TaskEventItem = TaskEvent extends (infer E)[] ? E : never;

/**
 * Handler context with machine identity.
 */
export interface EventHandlerContext {
  machineId: string;
  taskId: string;
}

/** Spawn requested event shape - using index signature for compatibility */
export interface SpawnRequestedEvent {
  type: 'spawn_requested';
  id: string;
  actor: string;
  timestamp: number;
  inboxWorthy: boolean | null;
  inboxFor: string | string[] | null;
  targetMachineId: string;
  prompt: string;
  cwd: string;
  requestedBy: string;
  [key: string]: unknown;
}

/** Track which spawn requests we've already processed */
const processedSpawnRequests = new Set<string>();

/** Track active git sync cleanup functions by request ID */
const activeGitSyncs = new Map<string, () => void>();

/** Max age for processed spawn requests (1 hour) */
const PROCESSED_SPAWN_REQUEST_MAX_AGE_MS = 60 * 60 * 1000;

/** Cleanup interval for processed spawn requests (5 minutes) */
const PROCESSED_SPAWN_REQUEST_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Track spawn request timestamps for cleanup */
const spawnRequestTimestamps = new Map<string, number>();

/** Cleanup timer ID */
let cleanupTimerId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic cleanup of processed spawn requests.
 * Should be called during server startup.
 */
export function startSpawnRequestCleanup(): () => void {
  if (cleanupTimerId !== null) {
    return () => stopSpawnRequestCleanup();
  }

  cleanupTimerId = setInterval(() => {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, timestamp] of spawnRequestTimestamps) {
      if (now - timestamp > PROCESSED_SPAWN_REQUEST_MAX_AGE_MS) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      processedSpawnRequests.delete(id);
      spawnRequestTimestamps.delete(id);
    }

    if (expiredIds.length > 0) {
      logger.debug({ count: expiredIds.length }, 'Cleaned up expired spawn request IDs');
    }
  }, PROCESSED_SPAWN_REQUEST_CLEANUP_INTERVAL_MS);

  return () => stopSpawnRequestCleanup();
}

/**
 * Stop the periodic cleanup of processed spawn requests.
 * Should be called during server shutdown.
 */
export function stopSpawnRequestCleanup(): void {
  if (cleanupTimerId !== null) {
    clearInterval(cleanupTimerId);
    cleanupTimerId = null;
  }
}

/**
 * Check if an event is a spawn_requested event.
 */
function isSpawnRequestedEvent(event: TaskEventItem): event is SpawnRequestedEvent {
  return event.type === 'spawn_requested';
}

/**
 * Handle a spawn_requested event.
 * Only processes if targetMachineId matches this daemon's machineId.
 */
export async function handleSpawnRequested(
  event: SpawnRequestedEvent,
  ctx: EventHandlerContext,
  handle: Handle<TaskDocumentShape>
): Promise<void> {
  const isForThisMachine =
    event.targetMachineId === ctx.machineId || event.targetMachineId === 'default';

  if (!isForThisMachine) {
    logger.debug(
      { eventId: event.id, targetMachineId: event.targetMachineId },
      'Ignoring spawn request for different machine'
    );
    return;
  }

  if (processedSpawnRequests.has(event.id)) {
    logger.debug({ eventId: event.id }, 'Spawn request already processed');
    return;
  }

  processedSpawnRequests.add(event.id);
  spawnRequestTimestamps.set(event.id, Date.now());

  logger.info(
    { eventId: event.id, taskId: ctx.taskId, cwd: event.cwd },
    'Processing spawn request'
  );

  try {
    const { spawnClaudeCode } = await import('../agents/spawner.js');

    const child = await spawnClaudeCode({
      taskId: ctx.taskId,
      prompt: event.prompt,
      cwd: event.cwd,
    });

    trackAgent(ctx.taskId, child);

    // Capture stderr for debugging
    let stderrOutput = '';
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });
    }

    try {
      handle.change((doc) => {
        doc.events.push({
          type: 'spawn_started',
          id: `spawn-started-${event.id}`,
          actor: 'daemon',
          timestamp: Date.now(),
          inboxWorthy: null,
          inboxFor: null,
          requestId: event.id,
          pid: child.pid ?? 0,
        });
      });

      logger.info(
        { eventId: event.id, taskId: ctx.taskId, pid: child.pid },
        'Agent spawned successfully - spawn_started event written'
      );

      // Start git sync now that agent is running
      const stopGitSync = startGitSync(handle, {
        machineId: getMachineId(),
        machineName: getMachineName(),
        ownerId: event.requestedBy,
        cwd: event.cwd,
        pollInterval: 5000,
      });
      activeGitSyncs.set(event.id, stopGitSync);

      logger.info(
        { eventId: event.id, taskId: ctx.taskId, cwd: event.cwd },
        'Git sync started for agent'
      );
    } catch (writeError) {
      logger.error(
        {
          eventId: event.id,
          taskId: ctx.taskId,
          pid: child.pid,
          error: writeError,
        },
        'Failed to write spawn_started event'
      );
    }

    child.once('exit', (exitCode, signal) => {
      logger.info(
        {
          eventId: event.id,
          taskId: ctx.taskId,
          exitCode,
          signal,
          stderr: stderrOutput.slice(0, 1000),
        },
        'Agent process exited'
      );
      // Stop git sync when agent exits
      const stopGitSync = activeGitSyncs.get(event.id);
      if (stopGitSync) {
        stopGitSync();
        activeGitSyncs.delete(event.id);
        logger.info({ eventId: event.id }, 'Git sync stopped for agent');
      }

      try {
        handle.change((doc) => {
          doc.events.push({
            type: 'spawn_completed',
            id: `spawn-completed-${event.id}`,
            actor: 'daemon',
            timestamp: Date.now(),
            inboxWorthy: null,
            inboxFor: null,
            requestId: event.id,
            exitCode: exitCode ?? 0,
          });
        });
      } catch (exitError) {
        logger.error(
          { eventId: event.id, exitCode, error: exitError },
          'Failed to write spawn_completed event'
        );
      }
    });

    child.once('error', (processError) => {
      logger.error({ eventId: event.id, error: processError }, 'Spawned process error');
    });
  } catch (error) {
    logger.error({ eventId: event.id, error }, 'Failed to spawn agent');

    handle.change((doc) => {
      doc.events.push({
        type: 'spawn_failed',
        id: `spawn-failed-${event.id}`,
        actor: 'daemon',
        timestamp: Date.now(),
        inboxWorthy: null,
        inboxFor: null,
        requestId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

/**
 * Subscribe to events on a task document.
 * Sets up Loro subscription to watch for spawn_requested events.
 *
 * Uses the loro-extended path selector pattern:
 * - `p => p.events` selects the events list
 * - The listener receives TaskEvent (which is TaskEventItem[]) directly
 */
export function subscribeToEvents(
  handle: Handle<TaskDocumentShape>,
  ctx: EventHandlerContext
): () => void {
  logger.debug({ taskId: ctx.taskId }, 'Subscribing to task events');

  let lastSeenEventCount = 0;

  const unsubscribe = handle.subscribe<TaskEvent>(
    (p) => p.events,
    (eventArray, _prev) => {
      const newEvents = eventArray.slice(lastSeenEventCount);
      lastSeenEventCount = eventArray.length;

      for (const event of newEvents) {
        if (isSpawnRequestedEvent(event)) {
          handleSpawnRequested(event, ctx, handle).catch((error) => {
            logger.error({ error, eventId: event.id }, 'Error handling spawn request');
          });
        }
      }
    }
  );

  return unsubscribe;
}

/**
 * Clear processed spawn requests (for testing).
 */
export function clearProcessedSpawnRequests(): void {
  processedSpawnRequests.clear();
  spawnRequestTimestamps.clear();
}

/**
 * Stop all active git syncs.
 * Should be called during daemon shutdown.
 */
export function stopAllGitSyncs(): void {
  for (const [eventId, stopGitSync] of activeGitSyncs) {
    stopGitSync();
    logger.info({ eventId }, 'Git sync stopped during shutdown');
  }
  activeGitSyncs.clear();
}

/**
 * Get count of active git syncs (for testing).
 */
export function getActiveGitSyncCount(): number {
  return activeGitSyncs.size;
}
