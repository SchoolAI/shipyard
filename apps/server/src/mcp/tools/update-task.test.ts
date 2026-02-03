/**
 * Integration tests for update_task MCP tool.
 *
 * Updates task metadata in the Loro document.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ToolHandler, ToolInputSchema } from "../index.js";

const mockGetTaskDocument = vi.fn();
const mockVerifySessionToken = vi.fn();
const mockGetGitHubUsername = vi.fn();

vi.mock("./helpers.js", () => ({
	getTaskDocument: (...args: unknown[]) => mockGetTaskDocument(...args),
	verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
	errorResponse: (msg: string) => ({
		content: [{ type: "text", text: msg }],
		isError: true,
	}),
	successResponse: (msg: string) => ({
		content: [{ type: "text", text: msg }],
	}),
}));

vi.mock("../../utils/identity.js", () => ({
	getGitHubUsername: () => mockGetGitHubUsername(),
}));

vi.mock("../../utils/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerUpdateTaskTool } from "./update-task.js";

function createMockServer(): {
	tool: ReturnType<typeof vi.fn>;
	registeredTools: Map<
		string,
		{ schema: ToolInputSchema; handler: ToolHandler }
	>;
} {
	const registeredTools = new Map<
		string,
		{ schema: ToolInputSchema; handler: ToolHandler }
	>();
	return {
		tool: vi.fn(
			(
				name: string,
				_desc: string,
				schema: ToolInputSchema,
				handler: ToolHandler,
			) => {
				registeredTools.set(name, { schema, handler });
			},
		),
		registeredTools,
	};
}

/** Get a registered tool or throw an error if not found */
function getTool(
	server: ReturnType<typeof createMockServer>,
	name: string,
): { schema: ToolInputSchema; handler: ToolHandler } {
	const tool = server.registeredTools.get(name);
	if (!tool) {
		throw new Error(`Tool "${name}" not registered`);
	}
	return tool;
}

function createMockTaskDoc(overrides?: { status?: string; title?: string }) {
	const tags: string[] = [];
	return {
		meta: {
			id: "task-123",
			title: overrides?.title ?? "Original Title",
			status: overrides?.status ?? "pending_review",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			sessionTokenHash: "hash123",
			tags: {
				push: (t: string) => tags.push(t),
				toJSON: () => tags,
				length: tags.length,
				delete: (start: number, count: number) => tags.splice(start, count),
			},
		},
		updateStatus: vi.fn(),
		syncTitleToRoom: vi.fn(),
		logEvent: vi.fn(),
	};
}

describe("MCP Tool: update_task", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifySessionToken.mockReturnValue(null);
		mockGetGitHubUsername.mockResolvedValue("test-user");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("task updates", () => {
		it("updates task title", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				title: "New Title",
			});

			expect(mockDoc.meta.title).toBe("New Title");
			expect(mockDoc.syncTitleToRoom).toHaveBeenCalled();
		});

		it("updates task status", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				status: "in_progress",
			});

			expect(mockDoc.updateStatus).toHaveBeenCalledWith(
				"in_progress",
				"test-user",
			);
		});

		it("updates task metadata (tags)", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				tags: ["bug", "priority"],
			});

			expect(mockDoc.meta.tags.toJSON()).toContain("bug");
			expect(mockDoc.meta.tags.toJSON()).toContain("priority");
		});

		it("preserves unmodified fields", async () => {
			const mockDoc = createMockTaskDoc({ title: "Keep This" });
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				status: "in_progress",
			});

			expect(mockDoc.meta.title).toBe("Keep This");
		});
	});

	describe("validation", () => {
		it("validates status transitions", async () => {
			const mockDoc = createMockTaskDoc({ status: "completed" });
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			// This should still work - no strict validation on transitions
			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				status: "draft",
			});

			expect(result.isError).toBeUndefined();
		});

		it("requires task ID", async () => {
			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			await expect(
				handler({ sessionToken: "token", title: "New Title" }),
			).rejects.toThrow();
		});
	});

	describe("events", () => {
		it("emits title_changed event on title update", async () => {
			const mockDoc = createMockTaskDoc({ title: "Old Title" });
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerUpdateTaskTool(server as unknown as McpServer);
			const { handler } = getTool(server, "update_task");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				title: "New Title",
			});

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"title_changed",
				"test-user",
				expect.objectContaining({
					fromTitle: "Old Title",
					toTitle: "New Title",
				}),
			);
		});
	});
});
