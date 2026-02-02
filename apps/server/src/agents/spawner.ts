/**
 * Agent spawner - manages Claude Code child processes.
 *
 * Spawns and tracks Claude Code sessions for tasks.
 * Ported from apps/daemon-legacy/src/agent-spawner.ts.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import type { ChildProcess } from "node:child_process";

/**
 * Options for spawning an agent.
 */
export interface SpawnAgentOptions {
	taskId: string;
	prompt: string;
	cwd: string;
}

/**
 * Options for spawning with conversation context.
 */
export interface SpawnWithContextOptions {
	taskId: string;
	cwd: string;
	a2aPayload: {
		messages: unknown[];
		meta: { planId?: string };
	};
}

/**
 * Spawn a new Claude Code agent for a task.
 */
export async function spawnClaudeCode(
	_opts: SpawnAgentOptions,
): Promise<ChildProcess> {
	// TODO: Implement from apps/daemon-legacy/src/agent-spawner.ts
	// - Check for existing agent, stop if running
	// - Build MCP config args
	// - Build system prompt with task context
	// - Spawn Claude Code process
	// - Track in active agents registry
	throw new Error("Not implemented");
}

/**
 * Spawn Claude Code with full conversation context (A2A handoff).
 */
export async function spawnClaudeCodeWithContext(
	_opts: SpawnWithContextOptions,
): Promise<{ child: ChildProcess; sessionId: string }> {
	// TODO: Implement from apps/daemon-legacy/src/agent-spawner.ts
	throw new Error("Not implemented");
}

/**
 * Stop a running agent.
 * @returns true if agent was found and stopped, false otherwise
 */
export function stopAgent(_taskId: string): boolean {
	// TODO: Implement
	throw new Error("Not implemented");
}
