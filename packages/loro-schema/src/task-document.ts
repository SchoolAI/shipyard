/**
 * TaskDocument class - thin coordination layer over Loro task document.
 *
 * Provides:
 * - Mutable container accessors for direct CRDT access
 * - Sync methods for cross-document coordination with RoomDocument
 * - Event logging helper
 */

import type { TypedDoc } from "@loro-extended/change";
import type { LoroDoc } from "loro-crdt";
import { generateEventId } from "./ids.js";
import type { EventId, TaskId } from "./ids.js";
import type { RoomShape, TaskDocumentShape } from "./shapes.js";

/** Task status values */
export type TaskStatus =
	| "draft"
	| "pending_review"
	| "changes_requested"
	| "in_progress"
	| "completed";

/**
 * Event types supported by logEvent.
 * Due to TypeScript limitations with the current schema typing,
 * we define this inline rather than extracting from TaskEvent.
 */
export type EventType =
	| "task_created"
	| "status_changed"
	| "completed"
	| "task_archived"
	| "task_unarchived"
	| "approved"
	| "changes_requested"
	| "comment_added"
	| "comment_resolved"
	| "artifact_uploaded"
	| "deliverable_linked"
	| "pr_linked"
	| "content_edited"
	| "input_request_created"
	| "input_request_answered"
	| "input_request_declined"
	| "input_request_cancelled"
	| "agent_activity"
	| "title_changed"
	| "spawn_requested"
	| "spawn_started"
	| "spawn_completed"
	| "spawn_failed";

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

	// ═══════════════════════════════════════════════════════════════
	// Container Accessors (Mutable)
	// ═══════════════════════════════════════════════════════════════

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

	// Type-safe accessors using any to work around schema typing issues
	// (TaskDocumentSchema has explicit `: DocShape` annotation which loses type info)

	/** Task metadata (id, title, status, timestamps, etc.) */
	get meta(): any {
		return (this.#taskDoc as any).meta;
	}

	/** Tiptap editor content (managed by loro-prosemirror) */
	get content(): any {
		return (this.#taskDoc as any).content;
	}

	/** Comments keyed by CommentId */
	get comments(): any {
		return (this.#taskDoc as any).comments;
	}

	/** Task artifacts (images, html, video) */
	get artifacts(): any {
		return (this.#taskDoc as any).artifacts;
	}

	/** Task deliverables */
	get deliverables(): any {
		return (this.#taskDoc as any).deliverables;
	}

	/** Task timeline events */
	get events(): any {
		return (this.#taskDoc as any).events;
	}

	/** Linked pull requests */
	get linkedPRs(): any {
		return (this.#taskDoc as any).linkedPRs;
	}

	/** Input requests from agent to user */
	get inputRequests(): any {
		return (this.#taskDoc as any).inputRequests;
	}

	/** Change snapshots keyed by MachineId */
	get changeSnapshots(): any {
		return (this.#taskDoc as any).changeSnapshots;
	}

	/** Get the underlying LoroDoc for editor integration */
	get loroDoc(): LoroDoc {
		// Access the internal LoroDoc from the typed doc
		// The TypedDoc proxy exposes loroDoc or _doc internally
		const doc = this.#taskDoc as any;
		if (doc.loroDoc) {
			return doc.loroDoc;
		}
		// Fallback: try to get from loro() accessor
		throw new Error(
			"Cannot access loroDoc - use loro(taskDoc).doc instead",
		);
	}

	// ═══════════════════════════════════════════════════════════════
	// Cross-Doc Sync Methods
	// ═══════════════════════════════════════════════════════════════

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
		const taskMeta = (this.#taskDoc as any).meta;
		const currentStatus = taskMeta.status as TaskStatus;

		// Update task document meta
		taskMeta.status = status;
		taskMeta.updatedAt = now;

		// Handle completion
		if (status === "completed") {
			taskMeta.completedAt = now;
			taskMeta.completedBy = actor;
		} else if (currentStatus === "completed") {
			// Transitioning away from completed
			taskMeta.completedAt = null;
			taskMeta.completedBy = null;
		}

		// Log the status change event
		this.logEvent("status_changed", actor, {
			fromStatus: currentStatus,
			toStatus: status,
		});

		// Update room index (if entry exists)
		const roomTaskIndex = (this.#roomDoc as any).taskIndex;
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
		const roomTaskIndex = (this.#roomDoc as any).taskIndex;
		const taskIndexEntry = roomTaskIndex.get(this.#taskId);
		if (taskIndexEntry) {
			taskIndexEntry.title = (this.#taskDoc as any).meta.title;
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
		// Check if any input requests have pending status
		const requests = (this.#taskDoc as any).inputRequests.toJSON();
		const hasPending = requests.some(
			(req: { status: string }) => req.status === "pending",
		);

		const roomTaskIndex = (this.#roomDoc as any).taskIndex;
		const taskIndexEntry = roomTaskIndex.get(this.#taskId);
		if (taskIndexEntry) {
			taskIndexEntry.hasPendingRequests = hasPending;
			taskIndexEntry.lastUpdated = Date.now();
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// Event Helper
	// ═══════════════════════════════════════════════════════════════

	/**
	 * Log an event to the timeline.
	 * Convenience wrapper that auto-fills timestamp and generates ID.
	 *
	 * If inboxWorthy is true, also adds the event to roomDoc.taskIndex.inboxEvents.
	 */
	logEvent(
		type: EventType,
		actor: string,
		data?: Record<string, unknown>,
		options?: LogEventOptions,
	): EventId {
		const id = generateEventId();
		const timestamp = Date.now();
		const inboxWorthy = options?.inboxWorthy ?? null;
		const inboxFor = options?.inboxFor ?? null;

		// Build the event object
		const event = {
			id,
			type,
			actor,
			timestamp,
			inboxWorthy,
			inboxFor,
			...data,
		};

		// Add to task document events
		(this.#taskDoc as any).events.push(event);

		// If inbox-worthy, also add to room index inboxEvents
		if (inboxWorthy) {
			const roomTaskIndex = (this.#roomDoc as any).taskIndex;
			const taskIndexEntry = roomTaskIndex.get(this.#taskId);
			if (taskIndexEntry) {
				taskIndexEntry.inboxEvents.push(event);
			}
		}

		return id;
	}

	// ═══════════════════════════════════════════════════════════════
	// Lifecycle
	// ═══════════════════════════════════════════════════════════════

	dispose(): void {
		// No cleanup needed - callers manage subscriptions
	}
}
