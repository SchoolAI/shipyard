/**
 * TaskDocument tests.
 *
 * Tests the TaskDocument class which provides a thin coordination layer
 * over Loro task documents with cross-document sync to RoomDocument.
 */

import { createTypedDoc } from "@loro-extended/change";
import { LoroDoc } from "loro-crdt";
import { beforeEach, describe, expect, it } from "vitest";
import type { TaskId } from "./ids.js";
import { RoomSchema, TaskDocumentSchema } from "./shapes.js";
import { TaskDocument } from "./task-document.js";

describe("TaskDocument", () => {
	let taskDoc: ReturnType<typeof createTypedDoc<typeof TaskDocumentSchema>>;
	let roomDoc: ReturnType<typeof createTypedDoc<typeof RoomSchema>>;
	let taskId: TaskId;

	beforeEach(() => {
		taskDoc = createTypedDoc(TaskDocumentSchema, new LoroDoc());
		roomDoc = createTypedDoc(RoomSchema, new LoroDoc());
		taskId = "test-task-id" as TaskId;
	});

	describe("construction", () => {
		it("creates a TaskDocument instance", () => {
			const document = new TaskDocument(taskDoc, roomDoc, taskId);
			expect(document).toBeInstanceOf(TaskDocument);
		});
	});

	describe("container accessors", () => {
		it("exposes taskId", () => {
			const document = new TaskDocument(taskDoc, roomDoc, taskId);
			expect(document.taskId).toBe(taskId);
		});

		it("exposes taskDoc", () => {
			const document = new TaskDocument(taskDoc, roomDoc, taskId);
			expect(document.taskDoc).toBe(taskDoc);
		});

		it("exposes roomDoc", () => {
			const document = new TaskDocument(taskDoc, roomDoc, taskId);
			expect(document.roomDoc).toBe(roomDoc);
		});
	});

	describe("lifecycle", () => {
		it("disposes without error", () => {
			const document = new TaskDocument(taskDoc, roomDoc, taskId);
			expect(() => document.dispose()).not.toThrow();
		});
	});

	// TODO: Add tests for cross-doc sync methods when implemented
	describe.skip("cross-doc sync", () => {
		it.todo("syncs task title changes to room taskIndex");
		it.todo("syncs task status changes to room taskIndex");
		it.todo("syncs inbox-worthy events to room taskIndex.inboxEvents");
	});
});
