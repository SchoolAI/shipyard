/**
 * Integration tests for reply_to_diff_comment MCP tool.
 *
 * Replies to specific PR diff comments on GitHub.
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
}));

vi.mock("../../utils/identity.js", () => ({
	getGitHubUsername: () => mockGetGitHubUsername(),
}));

vi.mock("../../utils/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerReplyToDiffCommentTool } from "./reply-to-diff-comment.js";

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

function createMockTaskDoc(comments?: Record<string, unknown>) {
	const allComments = comments ?? {
		"comment-1": {
			kind: "pr",
			id: "comment-1",
			threadId: "thread-1",
			body: "Original comment",
			author: "reviewer",
			path: "src/index.ts",
			line: 42,
			prNumber: 42,
		},
	};
	return {
		meta: {
			id: "task-123",
			sessionTokenHash: "hash123",
		},
		comments: {
			toJSON: () => allComments,
			set: vi.fn((id: string, comment: unknown) => {
				allComments[id] = comment;
			}),
		},
		logEvent: vi.fn(),
	};
}

describe("MCP Tool: reply_to_diff_comment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifySessionToken.mockReturnValue(null);
		mockGetGitHubUsername.mockResolvedValue("test-user");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("reply posting", () => {
		it("posts reply to task document", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				commentId: "pr:comment-1",
				body: "Thanks for the feedback!",
			});

			expect(result.isError).toBeUndefined();
			expect(result.content[0]?.text).toContain("Reply added");
		});

		it("associates reply with original comment", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				commentId: "comment-1",
				body: "Reply text",
			});

			expect(mockDoc.comments.set).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					inReplyTo: "comment-1",
				}),
			);
		});

		it("returns created reply info", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				commentId: "comment-1",
				body: "Reply",
			});

			const text = result.content[0]?.text || "";
			expect(text).toContain("Comment ID:");
			expect(text).toContain("Parent Comment ID: comment-1");
		});
	});

	describe("validation", () => {
		it("requires comment ID", async () => {
			const server = createMockServer();
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			await expect(
				handler({ taskId: "task-123", sessionToken: "token", body: "Reply" }),
			).rejects.toThrow();
		});

		it("requires reply body", async () => {
			const server = createMockServer();
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			await expect(
				handler({
					taskId: "task-123",
					sessionToken: "token",
					commentId: "c-1",
				}),
			).rejects.toThrow();
		});
	});

	describe("error handling", () => {
		it("handles comment not found", async () => {
			const mockDoc = createMockTaskDoc({});
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				commentId: "non-existent",
				body: "Reply",
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
			registerReplyToDiffCommentTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("reply_to_diff_comment")!;

			const result = await handler({
				taskId: "task-123",
				sessionToken: "invalid",
				commentId: "comment-1",
				body: "Reply",
			});

			expect(result.isError).toBe(true);
		});
	});
});
