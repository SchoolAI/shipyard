/**
 * Loro event handlers.
 *
 * Watches Loro doc events and triggers actions:
 * - spawn_requested -> spawn Claude Code agent
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

// TODO: Import from @shipyard/loro-schema
// import type { TaskEvent } from '@shipyard/loro-schema'

// TODO: Import spawner
// import { spawnClaudeCode } from '../agents/spawner.js'

/**
 * Handler context with machine identity.
 */
export interface EventHandlerContext {
	machineId: string;
}

/**
 * Handle a spawn_requested event.
 * Only processes if targetMachineId matches this daemon's machineId.
 */
export async function handleSpawnRequested(
	_event: {
		type: "spawn_requested";
		id: string;
		targetMachineId: string;
		prompt: string;
		cwd: string;
		requestedBy: string;
	},
	_ctx: EventHandlerContext,
): Promise<void> {
	// TODO: Implement spawn handling
	// if (event.targetMachineId !== ctx.machineId) return
	// const child = await spawnClaudeCode({ taskId, prompt: event.prompt, cwd: event.cwd })
	// Write spawn_started event to doc
	throw new Error("Not implemented");
}

/**
 * Subscribe to events on a task document.
 * Sets up Loro subscription to watch for spawn_requested events.
 */
export function subscribeToEvents(
	_docId: string,
	_ctx: EventHandlerContext,
): () => void {
	// TODO: Implement Loro subscription
	// doc.subscribe((p) => p.events, handler)
	// return unsubscribe function
	throw new Error("Not implemented");
}
