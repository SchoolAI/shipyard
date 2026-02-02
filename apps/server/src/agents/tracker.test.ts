/**
 * Integration tests for active agent registry.
 *
 * In-memory tracking of running Claude Code processes.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { describe, it } from "vitest";

describe("Agent Tracker", () => {
	describe("trackAgent", () => {
		it.todo("adds agent to registry");
		it.todo("stores process, pid, and startedAt");
		it.todo("removes agent on process exit");
	});

	describe("getAgent", () => {
		it.todo("returns agent by taskId");
		it.todo("returns undefined for unknown taskId");
	});

	describe("hasAgent", () => {
		it.todo("returns true for tracked agent");
		it.todo("returns false for untracked agent");
	});

	describe("untrackAgent", () => {
		it.todo("removes agent from registry");
		it.todo("handles non-existent agent gracefully");
	});

	describe("listAgents", () => {
		it.todo("returns all active agents");
		it.todo("includes calculated uptime");
		it.todo("returns empty array when no agents");
	});

	describe("agentCount", () => {
		it.todo("returns count of active agents");
		it.todo("returns 0 when no agents");
	});
});
