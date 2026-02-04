import type { Handle } from '@loro-extended/repo';
import type { TaskDocumentShape, TaskId } from '@shipyard/loro-schema';
import { RoomSchema, TaskDocumentSchema } from '@shipyard/loro-schema';
import { getMachineId } from '../utils/identity.js';
import { logger } from '../utils/logger.js';
import type { EventHandlerContext } from './handlers.js';
import { subscribeToEvents } from './handlers.js';
import { getRepo } from './repo.js';

const activeSubscriptions = new Map<TaskId, () => void>();

export function startTaskWatcher(): () => void {
  const repo = getRepo();
  const machineId = getMachineId();

  const roomHandle = repo.get('room', RoomSchema);

  logger.info('Starting task watcher - subscribing to room task index');

  const unsubscribeRoom = roomHandle.subscribe(
    (p) => p.taskIndex,
    (taskIndex) => {
      const taskIds = Object.keys(taskIndex) as TaskId[];

      logger.debug({ count: taskIds.length }, 'Task index updated');

      for (const taskId of taskIds) {
        if (activeSubscriptions.has(taskId)) {
          continue;
        }

        const taskHandle = repo.get(taskId, TaskDocumentSchema);
        const ctx: EventHandlerContext = { machineId, taskId };

        const unsubscribe = subscribeToEvents(taskHandle as Handle<TaskDocumentShape>, ctx);
        activeSubscriptions.set(taskId, unsubscribe);

        logger.info({ taskId }, 'Subscribed to task events');
      }
    }
  );

  return () => {
    logger.info('Stopping task watcher');
    unsubscribeRoom();
    for (const unsubscribe of activeSubscriptions.values()) {
      unsubscribe();
    }
    activeSubscriptions.clear();
  };
}

export function stopTaskWatcher(): void {
  for (const unsubscribe of activeSubscriptions.values()) {
    unsubscribe();
  }
  activeSubscriptions.clear();
}
