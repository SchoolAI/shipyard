/**
 * Active agent registry.
 *
 * In-memory tracking of running Claude Code processes.
 * Ported from apps/daemon-legacy/src/agent-spawner.ts activeAgents.
 */

import type { ChildProcess } from "node:child_process";

/**
 * Information about an active agent.
 */
export interface ActiveAgent {
	taskId: string;
	process: ChildProcess;
	pid: number;
	startedAt: number;
}

/**
 * Agent summary for API responses.
 */
export interface AgentSummary {
	taskId: string;
	pid: number;
	uptime: number;
}

/** In-memory registry of active agents */
const activeAgents = new Map<string, ActiveAgent>();

/**
 * Track a new agent.
 */
export function trackAgent(taskId: string, child: ChildProcess): void {
	if (child.pid) {
		activeAgents.set(taskId, {
			taskId,
			process: child,
			pid: child.pid,
			startedAt: Date.now(),
		});
	}

	child.once("exit", () => {
		activeAgents.delete(taskId);
	});
}

/**
 * Get a tracked agent by task ID.
 */
export function getAgent(taskId: string): ActiveAgent | undefined {
	return activeAgents.get(taskId);
}

/**
 * Check if an agent is running for a task.
 */
export function hasAgent(taskId: string): boolean {
	return activeAgents.has(taskId);
}

/**
 * Remove an agent from tracking.
 */
export function untrackAgent(taskId: string): void {
	activeAgents.delete(taskId);
}

/**
 * List all active agents.
 */
export function listAgents(): AgentSummary[] {
	const now = Date.now();
	return Array.from(activeAgents.values()).map((agent) => ({
		taskId: agent.taskId,
		pid: agent.pid,
		uptime: now - agent.startedAt,
	}));
}

/**
 * Get total count of active agents.
 */
export function agentCount(): number {
	return activeAgents.size;
}
