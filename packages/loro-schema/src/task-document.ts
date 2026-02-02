/**
 * TaskDocument class - thin coordination layer over Loro task document.
 *
 * Provides:
 * - Readonly container accessors for direct CRDT access
 * - Sync methods for cross-document coordination with RoomDocument
 * - Event logging helper
 */

import type { TypedDoc } from "@loro-extended/change";
import type { TaskId } from "./ids.js";
import type { RoomShape, TaskDocumentShape } from "./shapes.js";

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

	// ═══════════════════════════════════════════════════════════════
	// Cross-Doc Sync Methods
	// ═══════════════════════════════════════════════════════════════

	// TODO: Implement sync methods

	// ═══════════════════════════════════════════════════════════════
	// Lifecycle
	// ═══════════════════════════════════════════════════════════════

	dispose(): void {
		// TODO: Cleanup if needed
	}
}
