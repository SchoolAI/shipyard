/**
 * Integration tests for link_pr MCP tool.
 *
 * Links GitHub PRs to tasks.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ToolHandler, ToolInputSchema } from "../index.js";

const mockGetTaskDocument = vi.fn();
const mockVerifySessionToken = vi.fn();
const mockGetGitHubUsername = vi.fn();
const mockFetch = vi.fn();

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

// Mock global fetch
const originalFetch = global.fetch;

import { registerLinkPRTool } from "./link-pr.js";

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

function createMockTaskDoc() {
	const linkedPRs: unknown[] = [];
	return {
		meta: {
			id: "task-123",
			sessionTokenHash: "hash123",
			repo: "test-org/test-repo",
		},
		linkedPRs: {
			push: (pr: unknown) => linkedPRs.push(pr),
			toJSON: () => linkedPRs,
		},
		logEvent: vi.fn(),
	};
}

describe("MCP Tool: link_pr", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifySessionToken.mockReturnValue(null);
		mockGetGitHubUsername.mockResolvedValue("test-user");
		process.env.GITHUB_TOKEN = "test-token";
		global.fetch = mockFetch as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.GITHUB_TOKEN;
		global.fetch = originalFetch;
	});

	describe("PR linking", () => {
		it("links PR by number", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						html_url: "https://github.com/test-org/test-repo/pull/42",
						title: "Add feature",
						state: "open",
						draft: false,
						head: { ref: "feature-branch" },
					}),
			});

			const server = createMockServer();
			registerLinkPRTool(server as unknown as McpServer);
			const { handler } = getTool(server, "link_pr");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				prNumber: 42,
			});

			expect(result.isError).toBeUndefined();
			expect(result.content[0]?.text).toContain("PR linked successfully");
			expect(result.content[0]?.text).toContain("#42");
		});

		it("stores PR metadata", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						html_url: "https://github.com/test-org/test-repo/pull/42",
						title: "Add feature",
						state: "open",
						draft: false,
						head: { ref: "feature-branch" },
					}),
			});

			const server = createMockServer();
			registerLinkPRTool(server as unknown as McpServer);
			const { handler } = getTool(server, "link_pr");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				prNumber: 42,
			});

			const linkedPRs = mockDoc.linkedPRs.toJSON() as Array<{
				prNumber: number;
				title: string;
				branch: string;
			}>;
			expect(linkedPRs).toHaveLength(1);
			expect(linkedPRs[0]?.prNumber).toBe(42);
			expect(linkedPRs[0]?.title).toBe("Add feature");
			expect(linkedPRs[0]?.branch).toBe("feature-branch");
		});

		it("handles multiple PRs per task", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						html_url: "https://github.com/test-org/test-repo/pull/42",
						title: "PR Title",
						state: "open",
						draft: false,
						head: { ref: "branch" },
					}),
			});

			const server = createMockServer();
			registerLinkPRTool(server as unknown as McpServer);
			const { handler } = getTool(server, "link_pr");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				prNumber: 42,
			});
			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				prNumber: 43,
			});

			const linkedPRs = mockDoc.linkedPRs.toJSON() as unknown[];
			expect(linkedPRs).toHaveLength(2);
		});
	});

	describe("validation", () => {
		it("requires PR number", async () => {
			const server = createMockServer();
			registerLinkPRTool(server as unknown as McpServer);
			const { handler } = getTool(server, "link_pr");

			await expect(
				handler({ taskId: "task-123", sessionToken: "token" }),
			).rejects.toThrow();
		});

		it("validates PR exists on GitHub", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});
			mockFetch.mockResolvedValue({
				ok: false,
				status: 404,
			});

			const server = createMockServer();
			registerLinkPRTool(server as unknown as McpServer);
			const { handler } = getTool(server, "link_pr");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				prNumber: 9999,
			});

			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toContain("not found");
		});
	});

	describe("events", () => {
		it("emits pr_linked event", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});
			mockFetch.mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						html_url: "https://github.com/test-org/test-repo/pull/42",
						title: "Add feature",
						state: "open",
						draft: false,
						head: { ref: "feature-branch" },
					}),
			});

			const server = createMockServer();
			registerLinkPRTool(server as unknown as McpServer);
			const { handler } = getTool(server, "link_pr");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				prNumber: 42,
			});

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"pr_linked",
				"test-user",
				expect.objectContaining({
					prNumber: 42,
					title: "Add feature",
				}),
			);
		});
	});
});
