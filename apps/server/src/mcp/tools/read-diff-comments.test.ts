/**
 * Integration tests for read_diff_comments MCP tool.
 *
 * Reads PR review comments from GitHub.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ToolHandler, ToolInputSchema } from "../index.js";

const mockGetTaskDocument = vi.fn();
const mockVerifySessionToken = vi.fn();

vi.mock("./helpers.js", () => ({
	getTaskDocument: (...args: unknown[]) => mockGetTaskDocument(...args),
	verifySessionToken: (...args: unknown[]) => mockVerifySessionToken(...args),
	errorResponse: (msg: string) => ({
		content: [{ type: "text", text: msg }],
		isError: true,
	}),
}));

vi.mock("../../utils/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerReadDiffCommentsTool } from "./read-diff-comments.js";

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

function createMockTaskDoc(comments?: Record<string, unknown>) {
	return {
		meta: {
			id: "task-123",
			sessionTokenHash: "hash123",
		},
		comments: {
			toJSON: () => comments ?? {},
		},
	};
}

describe("MCP Tool: read_diff_comments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifySessionToken.mockReturnValue(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("comment reading", () => {
		it("fetches comments for task", async () => {
			const mockDoc = createMockTaskDoc({
				"comment-1": {
					kind: "pr",
					id: "comment-1",
					body: "Fix this bug",
					author: "reviewer",
					path: "src/index.ts",
					line: 42,
					resolved: false,
				},
			});
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReadDiffCommentsTool(server as unknown as McpServer);
			const { handler } = getTool(server, "read_diff_comments");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
			});

			expect(result.isError).toBeUndefined();
			expect(result.content[0]?.text).toContain("Fix this bug");
		});

		it("includes comment metadata", async () => {
			const mockDoc = createMockTaskDoc({
				"comment-1": {
					kind: "pr",
					id: "comment-1",
					body: "Review comment",
					author: "reviewer",
					path: "src/file.ts",
					line: 10,
					resolved: false,
				},
			});
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReadDiffCommentsTool(server as unknown as McpServer);
			const { handler } = getTool(server, "read_diff_comments");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
			});

			const text = result.content[0]?.text || "";
			expect(text).toContain("reviewer");
			expect(text).toContain("src/file.ts");
			expect(text).toContain("10");
		});

		it("includes file context", async () => {
			const mockDoc = createMockTaskDoc({
				"comment-1": {
					kind: "local",
					id: "comment-1",
					body: "Local comment",
					author: "dev",
					path: "src/utils.ts",
					line: 25,
					resolved: false,
				},
			});
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReadDiffCommentsTool(server as unknown as McpServer);
			const { handler } = getTool(server, "read_diff_comments");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
			});

			const text = result.content[0]?.text || "";
			expect(text).toContain("src/utils.ts");
		});

		it("handles empty comments", async () => {
			const mockDoc = createMockTaskDoc({});
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReadDiffCommentsTool(server as unknown as McpServer);
			const { handler } = getTool(server, "read_diff_comments");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
			});

			const text = result.content[0]?.text || "";
			expect(text).toContain("No diff comments found");
		});
	});

	describe("error handling", () => {
		it("handles task not found", async () => {
			mockGetTaskDocument.mockResolvedValue({
				success: false,
				error: 'Task "non-existent" not found.',
			});

			const server = createMockServer();
			registerReadDiffCommentsTool(server as unknown as McpServer);
			const { handler } = getTool(server, "read_diff_comments");

			const result = await handler({
				taskId: "non-existent",
				sessionToken: "token",
			});

			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toContain("not found");
		});

		it("handles invalid session token", async () => {
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: createMockTaskDoc(),
				meta: { sessionTokenHash: "hash123" },
			});
			mockVerifySessionToken.mockReturnValue("Invalid session token");

			const server = createMockServer();
			registerReadDiffCommentsTool(server as unknown as McpServer);
			const { handler } = getTool(server, "read_diff_comments");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "invalid-token",
			});

			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toContain("Invalid session token");
		});
	});
});
