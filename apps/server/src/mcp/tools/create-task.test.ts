/**
 * Integration tests for create_task MCP tool.
 *
 * Creates new tasks in the Loro document.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ToolHandler, ToolInputSchema } from "../index.js";

/** Mock getOrCreateTaskDocument */
const mockGetOrCreateTaskDocument = vi.fn();
const mockGetGitHubUsername = vi.fn();
const mockGetRepositoryFullName = vi.fn();
const mockParseEnv = vi.fn();

vi.mock("./helpers.js", () => ({
	getOrCreateTaskDocument: (...args: unknown[]) =>
		mockGetOrCreateTaskDocument(...args),
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
	getEnvironmentContext: () => ({
		projectName: "test-project",
		branch: "main",
	}),
	getRepositoryFullName: () => mockGetRepositoryFullName(),
}));

vi.mock("../../env.js", () => ({
	parseEnv: () => mockParseEnv(),
}));

vi.mock("../../utils/logger.js", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}));

/** Import after mocks are set up */
import { registerCreateTaskTool } from "./create-task.js";

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
	const meta = {
		id: "",
		title: "",
		status: "draft",
		createdAt: 0,
		updatedAt: 0,
		completedAt: null,
		completedBy: null,
		ownerId: null,
		sessionTokenHash: "",
		epoch: 1,
		repo: null,
		tags: {
			push: vi.fn(),
			toJSON: () => [],
			length: 0,
			delete: vi.fn(),
		},
		archivedAt: null,
		archivedBy: null,
	};

	return {
		meta,
		events: { push: (e: unknown) => events.push(e), toJSON: () => events },
		deliverables: { push: vi.fn(), toJSON: () => [] },
		logEvent: vi.fn(),
	};
}

describe("MCP Tool: create_task", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockParseEnv.mockReturnValue({
			WEB_URL: "http://localhost:3000",
			PORT: 32191,
		});
		mockGetGitHubUsername.mockResolvedValue("test-user");
		mockGetRepositoryFullName.mockReturnValue("test-org/test-repo");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("task creation", () => {
		it("creates task with required fields", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetOrCreateTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			const result = await handler({
				title: "Test Task",
				content: "Test content",
			});

			expect(result.isError).toBeUndefined();
			const text = result.content[0]?.text || "";
			expect(text).toContain("Task created!");
			expect(text).toContain("ID:");
			expect(text).toContain("Session Token:");
		});

		it("generates unique task ID", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetOrCreateTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			const result1 = await handler({ title: "Task 1", content: "Content 1" });
			const result2 = await handler({ title: "Task 2", content: "Content 2" });

			const text1 = result1.content[0]?.text || "";
			const text2 = result2.content[0]?.text || "";

			const id1 = text1.match(/ID: (\S+)/)?.[1];
			const id2 = text2.match(/ID: (\S+)/)?.[1];

			expect(id1).toBeDefined();
			expect(id2).toBeDefined();
			expect(id1).not.toBe(id2);
		});

		it("sets initial status to pending_review", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetOrCreateTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			await handler({ title: "Test Task", content: "Content" });

			expect(mockDoc.meta.status).toBe("pending_review");
		});

		it("writes to Loro document", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetOrCreateTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			await handler({ title: "My Task", content: "My content" });

			expect(mockDoc.meta.title).toBe("My Task");
			expect(mockDoc.meta.ownerId).toBe("test-user");
			expect(mockDoc.meta.createdAt).toBeGreaterThan(0);
			expect(mockDoc.meta.updatedAt).toBeGreaterThan(0);
		});
	});

	describe("validation", () => {
		it("requires title", async () => {
			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			await expect(handler({ content: "No title" })).rejects.toThrow();
		});

		it("validates optional fields", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetOrCreateTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			const result = await handler({
				title: "Test",
				content: "Content",
				tags: ["bug", "ui"],
				repo: "other-org/other-repo",
			});

			expect(result.isError).toBeUndefined();
			expect(mockDoc.meta.tags.push).toHaveBeenCalledWith("bug");
			expect(mockDoc.meta.tags.push).toHaveBeenCalledWith("ui");
			expect(mockDoc.meta.repo).toBe("other-org/other-repo");
		});
	});

	describe("events", () => {
		it("emits task_created event", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetOrCreateTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerCreateTaskTool(server as unknown as McpServer);
			const { handler } = server.registeredTools.get("create_task")!;

			await handler({ title: "Test Task", content: "Content" });

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"task_created",
				"test-user",
			);
		});
	});
});
