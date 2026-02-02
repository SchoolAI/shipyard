/**
 * Agent spawning and tracking layer.
 *
 * Provides:
 * - Claude Code process spawning (with optional A2A context)
 * - In-memory registry of running agents
 * - Loro doc event logging for spawn lifecycle
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

export type {
	A2AMessage,
	SpawnAgentOptions,
	SpawnWithContextOptions,
	SpawnWithContextResult,
} from "./spawner.js";
// Spawner exports
export {
	initSpawner,
	spawnClaudeCode,
	spawnClaudeCodeWithContext,
	stopAgent,
} from "./spawner.js";
export type { ActiveAgent, AgentSummary } from "./tracker.js";
// Tracker exports
export {
	agentCount,
	getAgent,
	hasAgent,
	listAgents,
	trackAgent,
	untrackAgent,
} from "./tracker.js";
