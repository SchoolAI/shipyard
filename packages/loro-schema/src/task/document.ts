/**
 * TaskDocument class - thin coordination layer over Loro task document.
 *
 * Provides:
 * - Mutable container accessors for direct CRDT access
 * - Sync methods for cross-document coordination with RoomDocument
 * - Event logging helper
 */

import type { TypedDoc } from "@loro-extended/change";
import type { EventId, TaskId } from "../ids.js";
import { generateEventId } from "../ids.js";
import type { RoomShape, TaskDocumentShape, TaskEventItem } from "../shapes.js";

/** Task status values */
export type TaskStatus =
	| "draft"
	| "pending_review"
	| "changes_requested"
	| "in_progress"
	| "completed";

/**
 * Event types derived from the TaskEventItem discriminated union.
 */
export type EventType = TaskEventItem["type"];

/**
 * Base fields that are auto-populated by logEvent.
 * These don't need to be passed in the data parameter.
 */
type EventAutoFields =
	| "id"
	| "type"
	| "actor"
	| "timestamp"
	| "inboxWorthy"
	| "inboxFor";

/**
 * Extract the extra data fields required for a specific event type.
 * Returns the fields that must be passed via the `data` parameter.
 */
type EventDataFor<T extends EventType> = Omit<
	Extract<TaskEventItem, { type: T }>,
	EventAutoFields
>;

/**
 * Determines if an event type requires extra data fields.
 * Used to make the `data` parameter optional for events with no extra fields.
 */
type RequiresData<T extends EventType> = keyof EventDataFor<T> extends never
	? false
	: true;

/** Options for logEvent */
export interface LogEventOptions {
	inboxWorthy?: boolean;
	inboxFor?: string | string[];
}

export class TaskDocument {
	readonly #taskDoc: TypedDoc<TaskDocumentShape>;
	readonly #roomDoc: TypedDoc<RoomShape>;
	readonly #taskId: TaskId;

	constructor(
		taskDoc: TypedDoc<TaskDocumentShape>,
		roomDoc: TypedDoc<RoomShape>,
		taskId: TaskId,
	) {
		this.#taskDoc = taskDoc;
		this.#roomDoc = roomDoc;
		this.#taskId = taskId;
	}

	/** Get the task ID */
	get taskId(): TaskId {
		return this.#taskId;
	}

	/** Get the underlying typed task document */
	get taskDoc(): TypedDoc<TaskDocumentShape> {
		return this.#taskDoc;
	}

	/** Get the underlying typed room document */
	get roomDoc(): TypedDoc<RoomShape> {
		return this.#roomDoc;
	}

	/** Task metadata (id, title, status, timestamps, etc.) */
	get meta() {
		return this.#taskDoc.meta;
	}

	/** Tiptap editor content (managed by loro-prosemirror) */
	get content() {
		return this.#taskDoc.content;
	}

	/** Comments keyed by CommentId */
	get comments() {
		return this.#taskDoc.comments;
	}

	/** Task artifacts (images, html, video) */
	get artifacts() {
		return this.#taskDoc.artifacts;
	}

	/** Task deliverables */
	get deliverables() {
		return this.#taskDoc.deliverables;
	}

	/** Task timeline events */
	get events() {
		return this.#taskDoc.events;
	}

	/** Linked pull requests */
	get linkedPRs() {
		return this.#taskDoc.linkedPRs;
	}

	/** Input requests from agent to user */
	get inputRequests() {
		return this.#taskDoc.inputRequests;
	}

	/** Change snapshots keyed by MachineId */
	get changeSnapshots() {
		return this.#taskDoc.changeSnapshots;
	}

	/**
	 * Update task status and sync to room index.
	 * Handles status transition logic.
	 *
	 * Cross-doc updates:
	 * - taskDoc.meta.status
	 * - taskDoc.meta.updatedAt
	 * - taskDoc.meta.completedAt/completedBy (if completed)
	 * - roomDoc.taskIndex[taskId].status
	 * - roomDoc.taskIndex[taskId].lastUpdated
	 * - Logs status_changed event
	 */
	updateStatus(status: TaskStatus, actor: string): void {
		const now = Date.now();
		const taskMeta = this.#taskDoc.meta;
		// eslint-disable-next-line no-restricted-syntax -- Loro schema returns string, we know it's TaskStatus from Shape definition
		const currentStatus = taskMeta.status as TaskStatus;

		taskMeta.status = status;
		taskMeta.updatedAt = now;

		if (status === "completed") {
			taskMeta.completedAt = now;
			taskMeta.completedBy = actor;
		} else if (currentStatus === "completed") {
			taskMeta.completedAt = null;
			taskMeta.completedBy = null;
		}

		this.logEvent("status_changed", actor, {
			fromStatus: currentStatus,
			toStatus: status,
		});

		const roomTaskIndex = this.#roomDoc.taskIndex;
		const taskIndexEntry = roomTaskIndex.get(this.#taskId);
		if (taskIndexEntry) {
			taskIndexEntry.status = status;
			taskIndexEntry.lastUpdated = now;
		}
	}

	/**
	 * Sync title to room index.
	 * Call after mutating meta.title directly.
	 *
	 * Cross-doc updates:
	 * - roomDoc.taskIndex[taskId].title
	 * - roomDoc.taskIndex[taskId].lastUpdated
	 */
	syncTitleToRoom(): void {
		const roomTaskIndex = this.#roomDoc.taskIndex;
		const taskIndexEntry = roomTaskIndex.get(this.#taskId);
		if (taskIndexEntry) {
			taskIndexEntry.title = this.#taskDoc.meta.title;
			taskIndexEntry.lastUpdated = Date.now();
		}
	}

	/**
	 * Recalculate hasPendingRequests flag and sync to room index.
	 * Call after ANY mutation to inputRequests list (add, answer, decline, cancel).
	 *
	 * Cross-doc updates:
	 * - roomDoc.taskIndex[taskId].hasPendingRequests
	 * - roomDoc.taskIndex[taskId].lastUpdated
	 */
	syncPendingRequestsToRoom(): void {
		const requests = this.#taskDoc.inputRequests.toJSON();
		const hasPending = requests.some(
			(req: { status: string }) => req.status === "pending",
		);

		const roomTaskIndex = this.#roomDoc.taskIndex;
		const taskIndexEntry = roomTaskIndex.get(this.#taskId);
		if (taskIndexEntry) {
			taskIndexEntry.hasPendingRequests = hasPending;
			taskIndexEntry.lastUpdated = Date.now();
		}
	}

	/**
	 * Log an event to the timeline.
	 * Convenience wrapper that auto-fills timestamp and generates ID.
	 *
	 * If inboxWorthy is true, also adds the event to roomDoc.taskIndex.inboxEvents.
	 *
	 * @example
	 * // Events with no extra fields - data is optional
	 * logEvent("task_created", "user123");
	 *
	 * // Events with extra fields - data is required and type-checked
	 * logEvent("status_changed", "user123", { fromStatus: "draft", toStatus: "in_progress" });
	 */
	logEvent<T extends EventType>(
		type: T,
		actor: string,
		...args: RequiresData<T> extends true
			? [data: EventDataFor<T>, options?: LogEventOptions]
			: [data?: EventDataFor<T>, options?: LogEventOptions]
	): EventId {
		const [data, options] = args;
		const id = generateEventId();
		const timestamp = Date.now();
		const inboxWorthy = options?.inboxWorthy ?? null;
		const inboxFor = options?.inboxFor ?? null;

		// eslint-disable-next-line no-restricted-syntax -- Discriminated union construction
		const event = {
			id,
			type,
			actor,
			timestamp,
			inboxWorthy,
			inboxFor,
			...data,
		} as unknown as Extract<TaskEventItem, { type: T }>;

		this.#taskDoc.events.push(event);

		if (inboxWorthy) {
			const roomTaskIndex = this.#roomDoc.taskIndex;
			const taskIndexEntry = roomTaskIndex.get(this.#taskId);
			if (taskIndexEntry) {
				taskIndexEntry.inboxEvents.push(event);
			}
		}

		return id;
	}

	dispose(): void {}
}
