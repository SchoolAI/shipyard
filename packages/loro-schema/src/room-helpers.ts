import { change, type TypedDoc } from '@loro-extended/change';
import type { TaskIndexDocumentShape, TaskIndexEntry } from './room-schema.js';
import type { A2ATaskState } from './shapes.js';

/**
 * Add a task to the room's task index.
 * Called when creating a new task.
 */
export function addTaskToIndex(
  doc: TypedDoc<TaskIndexDocumentShape>,
  entry: {
    taskId: string;
    title: string;
    status: A2ATaskState;
    createdAt: number;
    updatedAt: number;
  }
): void {
  change(doc, (draft) => {
    draft.taskIndex.set(entry.taskId, {
      taskId: entry.taskId,
      title: entry.title,
      status: entry.status,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  });
}

/**
 * Update a task entry in the room's task index.
 * Called after TaskDocument mutations that affect indexed fields.
 */
export function updateTaskInIndex(
  doc: TypedDoc<TaskIndexDocumentShape>,
  taskId: string,
  updates: Partial<Pick<TaskIndexEntry, 'title' | 'status' | 'updatedAt'>>
): void {
  if (Object.keys(updates).length === 0) return;

  change(doc, (draft) => {
    if (!draft.taskIndex.has(taskId)) return;
    const entry = draft.taskIndex.get(taskId);
    if (!entry) return;

    if (updates.title !== undefined) {
      entry.title = updates.title;
    }
    if (updates.status !== undefined) {
      entry.status = updates.status;
    }
    if (updates.updatedAt !== undefined) {
      entry.updatedAt = updates.updatedAt;
    }
  });
}

/**
 * Remove a task from the room's task index.
 */
export function removeTaskFromIndex(doc: TypedDoc<TaskIndexDocumentShape>, taskId: string): void {
  change(doc, (draft) => {
    if (!draft.taskIndex.has(taskId)) return;
    draft.taskIndex.delete(taskId);
  });
}
