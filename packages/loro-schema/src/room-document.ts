/**
 * RoomDocument class - thin wrapper over Loro room document.
 *
 * Provides:
 * - Readonly container accessor for taskIndex
 * - Convenience helpers for querying tasks
 * - No mutation methods (taskIndex updated by TaskDocument sync methods)
 */

import type { TypedDoc } from "@loro-extended/change";
import type { RoomShape } from "./shapes.js";

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

	// TODO: Implement helper methods

	// ═══════════════════════════════════════════════════════════════
	// Lifecycle
	// ═══════════════════════════════════════════════════════════════

	dispose(): void {
		// TODO: Cleanup if needed
	}
}
