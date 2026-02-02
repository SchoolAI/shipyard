/**
 * TaskDocument class - thin coordination layer over Loro task document.
 *
 * Provides:
 * - Readonly container accessors for direct CRDT access
 * - Sync methods for cross-document coordination with RoomDocument
 * - Event logging helper
 */

import type { LoroDoc } from "loro-crdt";
import type { TypedDoc } from "@loro-extended/change";
import type { TaskDocumentShape, RoomShape } from "./shapes.js";
import type { TaskId } from "./ids.js";

export class TaskDocument {
	private readonly taskDoc: TypedDoc<TaskDocumentShape>;
	private readonly roomDoc: TypedDoc<RoomShape>;
	private readonly taskId: TaskId;

	constructor(
		taskDoc: TypedDoc<TaskDocumentShape>,
		roomDoc: TypedDoc<RoomShape>,
		taskId: TaskId,
	) {
		this.taskDoc = taskDoc;
		this.roomDoc = roomDoc;
		this.taskId = taskId;
	}

	// ═══════════════════════════════════════════════════════════════
	// Container Accessors (Mutable)
	// ═══════════════════════════════════════════════════════════════

	// TODO: Implement container accessors

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
