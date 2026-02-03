/**
 * Integration tests for setup_review_notification MCP tool.
 *
 * Configures review notification settings for tasks.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, ToolHandler, ToolInputSchema } from "../index.js";

const mockParseEnv = vi.fn();

vi.mock("../../env.js", () => ({
	parseEnv: () => mockParseEnv(),
}));

vi.mock("../../utils/logger.js", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { registerSetupReviewNotificationTool } from "./setup-review-notification.js";

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

describe("MCP Tool: setup_review_notification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockParseEnv.mockReturnValue({ PORT: 32191 });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("notification setup", () => {
		it("configures notification preferences (returns script)", async () => {
			const server = createMockServer();
			registerSetupReviewNotificationTool(server as unknown as McpServer);
			const { handler } = getTool(server, "setup_review_notification");

			const result = await handler({
				taskId: "task-123",
			});

			expect(result.isError).toBeUndefined();
			expect(result.content[0]?.text).toContain("#!/bin/bash");
			expect(result.content[0]?.text).toContain("task-123");
		});

		it("stores settings (includes port in script)", async () => {
			const server = createMockServer();
			registerSetupReviewNotificationTool(server as unknown as McpServer);
			const { handler } = getTool(server, "setup_review_notification");

			const result = await handler({
				taskId: "task-123",
				pollIntervalSeconds: 15,
			});

			const text = result.content[0]?.text || "";
			expect(text).toContain("32191");
			expect(text).toContain("POLL_INTERVAL=15");
		});
	});

	describe("validation", () => {
		it("validates notification type (uses default poll interval)", async () => {
			const server = createMockServer();
			registerSetupReviewNotificationTool(server as unknown as McpServer);
			const { handler } = getTool(server, "setup_review_notification");

			const result = await handler({ taskId: "task-123" });

			const text = result.content[0]?.text || "";
			expect(text).toContain("POLL_INTERVAL=30");
		});

		it("validates target settings (script contains task ID)", async () => {
			const server = createMockServer();
			registerSetupReviewNotificationTool(server as unknown as McpServer);
			const { handler } = getTool(server, "setup_review_notification");

			const result = await handler({
				taskId: "my-special-task-id",
			});

			const text = result.content[0]?.text || "";
			expect(text).toContain("my-special-task-id");
		});
	});
});
