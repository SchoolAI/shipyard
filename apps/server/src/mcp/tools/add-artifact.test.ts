/**
 * Integration tests for add_artifact MCP tool.
 *
 * Adds artifacts (files, links, etc.) to tasks.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ToolHandler, ToolInputSchema } from "../index.js";

const mockGetTaskDocument = vi.fn();
const mockVerifySessionToken = vi.fn();
const mockGetGitHubUsername = vi.fn();
const mockReadFile = vi.fn();
const mockUploadArtifact = vi.fn();
const mockIsGitHubConfigured = vi.fn();

vi.mock("node:fs/promises", () => ({
	readFile: (...args: unknown[]) => mockReadFile(...args),
}));

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

vi.mock("../../utils/github-artifacts.js", () => ({
	isGitHubConfigured: () => mockIsGitHubConfigured(),
	uploadArtifact: (...args: unknown[]) => mockUploadArtifact(...args),
	GitHubAuthError: class GitHubAuthError extends Error {
		constructor(msg: string) {
			super(msg);
			this.name = "GitHubAuthError";
		}
	},
}));

import { registerAddArtifactTool } from "./add-artifact.js";

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
	const artifacts: unknown[] = [];
	const deliverables = [
		{ id: "del-1", text: "First deliverable", linkedArtifactId: null },
	];
	return {
		meta: {
			id: "task-123",
			sessionTokenHash: "hash123",
			repo: "test-org/test-repo",
		},
		artifacts: {
			push: (a: unknown) => artifacts.push(a),
			toJSON: () => artifacts,
		},
		deliverables: {
			toJSON: () => deliverables,
		},
		logEvent: vi.fn(),
	};
}

describe("MCP Tool: add_artifact", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockVerifySessionToken.mockReturnValue(null);
		mockGetGitHubUsername.mockResolvedValue("test-user");
		mockReadFile.mockResolvedValue(Buffer.from("fake file content"));
		mockIsGitHubConfigured.mockReturnValue(true);
		mockUploadArtifact.mockResolvedValue(
			"https://raw.githubusercontent.com/test-org/test-repo/plan-artifacts/plans/task-123/screenshot.png",
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("artifact creation", () => {
		it("adds file artifact", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "screenshot.png",
				source: "file",
				filePath: "/path/to/screenshot.png",
			});

			expect(result.isError).toBeUndefined();
			expect(mockDoc.artifacts.toJSON()).toHaveLength(1);
		});

		it("adds base64 artifact", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "screenshot.png",
				source: "base64",
				content: "iVBORw0KGgoAAAANSUhEUg==",
			});

			expect(result.isError).toBeUndefined();
			const text = result.content[0]?.text || "";
			expect(text).toContain("Artifact uploaded!");
		});

		it("generates unique artifact ID", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "screenshot1.png",
				source: "base64",
				content: "content1",
			});

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "screenshot2.png",
				source: "base64",
				content: "content2",
			});

			const artifacts = mockDoc.artifacts.toJSON() as Array<{ id: string }>;
			expect(artifacts[0]?.id).not.toBe(artifacts[1]?.id);
		});

		it("associates artifact with task", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "screenshot.png",
				source: "base64",
				content: "content",
			});

			expect(mockGetTaskDocument).toHaveBeenCalledWith("task-123");
		});
	});

	describe("validation", () => {
		it("requires artifact type", async () => {
			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			await expect(
				handler({
					taskId: "task-123",
					sessionToken: "token",
					filename: "test.png",
					source: "base64",
					content: "content",
				}),
			).rejects.toThrow();
		});

		it("validates artifact content - invalid file extension", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			const result = await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "test.txt", // Wrong extension for image type
				source: "base64",
				content: "content",
			});

			expect(result.isError).toBe(true);
			expect(result.content[0]?.text).toContain("Invalid file extension");
		});
	});

	describe("events", () => {
		it("emits artifact_uploaded event", async () => {
			const mockDoc = createMockTaskDoc();
			mockGetTaskDocument.mockResolvedValue({
				success: true,
				doc: mockDoc,
				meta: mockDoc.meta,
			});

			const server = createMockServer();
			registerAddArtifactTool(server as unknown as McpServer);
			const { handler } = getTool(server, "add_artifact");

			await handler({
				taskId: "task-123",
				sessionToken: "valid-token",
				type: "image",
				filename: "screenshot.png",
				source: "base64",
				content: "content",
			});

			expect(mockDoc.logEvent).toHaveBeenCalledWith(
				"artifact_uploaded",
				"test-user",
				expect.objectContaining({
					filename: "screenshot.png",
					artifactType: "image",
				}),
			);
		});
	});
});
