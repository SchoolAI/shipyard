/**
 * Integration tests for agent spawner.
 *
 * Manages Claude Code child processes.
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import { describe, it } from "vitest";

describe("Agent Spawner", () => {
	describe("spawnClaudeCode", () => {
		it.todo("spawns Claude Code child process");
		it.todo("passes prompt to Claude Code");
		it.todo("sets working directory to cwd");
		it.todo("configures MCP server args");
		it.todo("tracks spawned agent in registry");
		it.todo("returns ChildProcess handle");
	});

	describe("spawnClaudeCodeWithContext", () => {
		it.todo("spawns with A2A conversation payload");
		it.todo("passes message history");
		it.todo("returns sessionId with child process");
	});

	describe("stopAgent", () => {
		it.todo("kills running agent process");
		it.todo("removes from tracker");
		it.todo("returns true when agent found and stopped");
		it.todo("returns false when agent not found");
	});
});
