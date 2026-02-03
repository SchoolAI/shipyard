/**
 * Integration tests for post_update MCP tool.
 *
 * Posts status updates to the task timeline.
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

import { registerPostUpdateTool } from "./post-update.js";

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

function createMockTaskDoc() {
	const events: unknown[] = [];
	return {
		meta: {
			id: "task-123",
			sessionTokenHash: "hash123",
		},
		events: {
			push: (e: unknown) => events.push(e),
			toJSON: () => events,
		},
		logEvent: vi.fn().mockReturnValue("evt-123"),
	};
}

describe("MCP Tool: post_update", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifySessionToken.mockReturnValue(null);
		mockGetGitHubUsername.mockResolvedValue("test-user");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("update posting", () => {
		it("creates timeline entry", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				message: "Starting work on feature",
			});

			expect(result.isError).toBeUndefined();
			expect(mockDoc.logEvent).toHaveBeenCalled();
		});

		it("supports different update types (agent_activity)", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				message: "Progress update",
			});

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"agent_activity",
				"test-user",
				expect.objectContaining({
					message: "Progress update",
				}),
			);
		});

		it("includes timestamp (via logEvent)", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				message: "Update",
			});

			expect(mockDoc.logEvent).toHaveBeenCalled();
		});

		it("associates with actor", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				message: "Update",
			});

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"agent_activity",
				"test-user",
				expect.anything(),
			);
		});
	});

	describe("validation", () => {
		it("requires message content", async () => {
			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			await expect(
				handler({ taskId: "task-123", sessionToken: "token" }),
			).rejects.toThrow();
		});

		it("validates task exists", async () => {
			mockGetTaskDocument.mockResolvedValue({
				success: false,
				error: 'Task "non-existent" not found.',
			});

			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			const result = await handler({
				taskId: "non-existent",
				sessionToken: "token",
				message: "Update",
			});

			expect(result.isError).toBe(true);
		});
	});

	describe("events", () => {
		it("emits agent_activity event", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerPostUpdateTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("post_update")!;

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				message: "Feature complete",
			});

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"agent_activity",
				"test-user",
				expect.objectContaining({ message: "Feature complete" }),
			);
		});
	});
});
