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
import type { RoomShape, TaskIndexEntry } from "./schema.js";

export interface GetTasksOptions {
	/** Include archived tasks (default: false) */
	includeArchived?: boolean;
}

export class RoomDocument {
	readonly #roomDoc: TypedDoc<RoomShape>;

	constructor(roomDoc: TypedDoc<RoomShape>) {
		this.#roomDoc = roomDoc;
	}

	// ═══════════════════════════════════════════════════════════════
	// Container Accessors (Readonly)
	// ═══════════════════════════════════════════════════════════════

	/** Get the underlying typed room document */
	get roomDoc(): TypedDoc<RoomShape> {
		return this.#roomDoc;
	}

	// ═══════════════════════════════════════════════════════════════
	// Convenience Helpers
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Get all tasks sorted by lastUpdated descending.
	 *
	 * Note: Archived tasks are excluded by default. The TaskMeta.archivedAt
	 * field is on TaskDocument, not TaskIndex. For now, this method returns
	 * all tasks since TaskIndex doesn't track archived status.
	 */
	getTasks(_options?: GetTasksOptions): TaskIndexEntry[] {
		const taskIndex = this.#roomDoc.taskIndex.toJSON() as unknown as Record<
			string,
			TaskIndexEntry
		>;
		const tasks = Object.values(taskIndex);

		// Sort by lastUpdated descending (most recent first)
		return tasks.sort(
			(a: TaskIndexEntry, b: TaskIndexEntry) =>
				(b.lastUpdated as unknown as number) - (a.lastUpdated as unknown as number),
		);
	}

	/**
	 * Get tasks with hasPendingRequests = true.
	 */
	getTasksWithPendingRequests(): TaskIndexEntry[] {
		return this.getTasks().filter((task) => task.hasPendingRequests);
	}

	/**
	 * Check if a task is unread for a user.
	 * Compares viewedBy timestamp against task's lastUpdated.
	 *
	 * @returns true if the task has been updated since the user last viewed it
	 */
	isTaskUnread(taskId: TaskId, username: string): boolean {
		const taskIndex = this.#roomDoc.taskIndex.toJSON();
		const task = taskIndex[taskId];
		if (!task) {
			return false;
		}

		const viewedAt = task.viewedBy[username];
		if (viewedAt === undefined) {
			// User has never viewed this task
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
		const taskIndex = this.#roomDoc.taskIndex.toJSON();
		const task = taskIndex[taskId];
		if (!task) {
			return false;
		}

		const eventViewedByUsers = task.eventViewedBy[eventId];
		if (!eventViewedByUsers) {
			// Event has never been viewed by anyone
			return true;
		}

		const viewedAt = eventViewedByUsers[username];
		return viewedAt === undefined;
	}

	// ═══════════════════════════════════════════════════════════════
	// Lifecycle
	// ═══════════════════════════════════════════════════════════════

	dispose(): void {
		// No cleanup needed - RoomDocument doesn't manage subscriptions
	}
}
