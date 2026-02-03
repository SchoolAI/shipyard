/**
 * RoomDocument class - thin wrapper over Loro room document.
 *
 * Provides:
 * - Readonly container accessor for taskIndex
 * - Convenience helpers for querying tasks
 * - No mutation methods (taskIndex updated by TaskDocument sync methods)
 */

import type { TypedDoc } from "@loro-extended/change";
import type { EventId, TaskId } from "../ids.js";
import type { RoomShape, TaskIndexEntry } from "../shapes.js";

/** Task index entry value type derived from schema */
export type TaskIndexEntryValue = TaskIndexEntry[string];

export interface GetTasksOptions {
	/** Include archived tasks (default: false) */
	includeArchived?: boolean;
}

export class RoomDocument {
	readonly #roomDoc: TypedDoc<RoomShape>;

	constructor(roomDoc: TypedDoc<RoomShape>) {
		this.#roomDoc = roomDoc;
	}

	/** Get the underlying typed room document */
	get roomDoc(): TypedDoc<RoomShape> {
		return this.#roomDoc;
	}

	/**
	 * Get all tasks sorted by lastUpdated descending.
	 *
	 * Note: Archived tasks are excluded by default. The TaskMeta.archivedAt
	 * field is on TaskDocument, not TaskIndex. For now, this method returns
	 * all tasks since TaskIndex doesn't track archived status.
	 */
	getTasks(_options?: GetTasksOptions): TaskIndexEntryValue[] {
		const taskIndex = this.#roomDoc.taskIndex;
		const tasks: (typeof taskIndex)[keyof typeof taskIndex][] =
			Object.values(taskIndex);

		return tasks.sort((a, b) => b.lastUpdated - a.lastUpdated);
	}

	/**
	 * Get tasks with hasPendingRequests = true.
	 */
	getTasksWithPendingRequests(): TaskIndexEntryValue[] {
		return this.getTasks().filter((task) => task.hasPendingRequests);
	}

	/**
	 * Check if a task is unread for a user.
	 * Compares viewedBy timestamp against task's lastUpdated.
	 *
	 * @returns true if the task has been updated since the user last viewed it
	 */
	isTaskUnread(taskId: TaskId, username: string): boolean {
		const task = this.#roomDoc.taskIndex.get(taskId);
		if (!task) {
			return false;
		}

		const viewedAt = task.viewedBy.get(username);
		if (viewedAt === undefined) {
			return true;
		}

		return task.lastUpdated > viewedAt;
	}

	/**
	 * Check if a specific event is unread for a user.
	 *
	 * @returns true if the event has not been marked as read by the user
	 */
	isEventUnread(taskId: TaskId, eventId: EventId, username: string): boolean {
		const task = this.#roomDoc.taskIndex.get(taskId);
		if (!task) {
			return false;
		}

		const eventViewedByUsers = task.eventViewedBy.get(eventId);
		if (!eventViewedByUsers) {
			return true;
		}

		const viewedAt = eventViewedByUsers.get(username);
		return viewedAt === undefined;
	}

	dispose(): void {}
}
