/**
 * RoomDocument tests.
 *
 * Tests the RoomDocument class which provides a thin wrapper
 * over Loro room documents with task index querying.
 */

import { createTypedDoc } from "@loro-extended/change";
import { LoroDoc } from "loro-crdt";
import { beforeEach, describe, expect, it } from "vitest";
import { RoomDocument } from "./room-document.js";
import { RoomSchema } from "./shapes.js";

describe("RoomDocument", () => {
	let roomDoc: ReturnType<typeof createTypedDoc<typeof RoomSchema>>;

	beforeEach(() => {
		roomDoc = createTypedDoc(RoomSchema, new LoroDoc());
	});

	describe("construction", () => {
		it("creates a RoomDocument instance", () => {
			const document = new RoomDocument(roomDoc);
			expect(document).toBeInstanceOf(RoomDocument);
		});
	});

	describe("container accessors", () => {
		it("exposes roomDoc", () => {
			const document = new RoomDocument(roomDoc);
			expect(document.roomDoc).toBe(roomDoc);
		});
	});

	describe("lifecycle", () => {
		it("disposes without error", () => {
			const document = new RoomDocument(roomDoc);
			expect(() => document.dispose()).not.toThrow();
		});
	});

	// TODO: Add tests for helper methods when implemented
});
