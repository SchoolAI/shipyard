/**
 * Integration tests for read_diff_comments MCP tool.
 *
 * Reads PR review comments from GitHub.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { describe, it } from "vitest";

describe("MCP Tool: read_diff_comments", () => {
	describe("comment reading", () => {
		it.todo("fetches comments for PR");
		it.todo("includes comment metadata");
		it.todo("includes file context");
		it.todo("handles pagination");
	});

	describe("error handling", () => {
		it.todo("handles PR not found");
		it.todo("handles GitHub API errors");
	});
});
