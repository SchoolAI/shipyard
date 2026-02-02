/**
 * Integration tests for execute_code MCP tool.
 *
 * The main tool agents use to interact with task documents via sandboxed JS.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { describe, it } from "vitest";

describe("MCP Tool: execute_code", () => {
	describe("sandbox execution", () => {
		it.todo("executes JavaScript code in VM sandbox");
		it.todo("provides access to task APIs (createTask, readTask, etc.)");
		it.todo("returns execution result");
		it.todo("captures console output");
	});

	describe("security", () => {
		it.todo("prevents access to node:fs");
		it.todo("prevents access to node:child_process");
		it.todo("enforces timeout on long-running code");
		it.todo("limits memory usage");
	});

	describe("error handling", () => {
		it.todo("returns syntax errors gracefully");
		it.todo("returns runtime errors with stack trace");
		it.todo("handles async rejection");
	});
});
