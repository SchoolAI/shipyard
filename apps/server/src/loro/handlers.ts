/**
 * Loro event handlers.
 *
 * Watches Loro doc events and triggers actions:
 * - spawn_requested -> spawn Claude Code agent
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import type { HandleWithEphemerals } from "@loro-extended/repo";
import type { TaskDocumentShape, TaskEvent } from "@shipyard/loro-schema";
import { trackAgent } from "../agents/tracker.js";
import { logger } from "../utils/logger.js";

/**
 * Handler context with machine identity.
 */
export interface EventHandlerContext {
	machineId: string;
	taskId: string;
}

/** Spawn requested event shape */
export interface SpawnRequestedEvent {
	type: "spawn_requested";
	id: string;
	actor: string;
	timestamp: number;
	inboxWorthy: boolean | null;
	inboxFor: string | string[] | null;
	targetMachineId: string;
	prompt: string;
	cwd: string;
	requestedBy: string;
}

/** Track which spawn requests we've already processed */
const processedSpawnRequests = new Set<string>();

/**
 * Check if an event is a spawn_requested event.
 */
function isSpawnRequestedEvent(event: TaskEvent): event is SpawnRequestedEvent {
	return (
		typeof event === "object" &&
		event !== null &&
		"type" in event &&
		event.type === "spawn_requested"
	);
}

/**
 * Handle a spawn_requested event.
 * Only processes if targetMachineId matches this daemon's machineId.
 */
export async function handleSpawnRequested(
	event: SpawnRequestedEvent,
	ctx: EventHandlerContext,
	handle: HandleWithEphemerals<TaskDocumentShape, Record<string, never>>,
): Promise<void> {
	// Skip if not targeted at this machine
	if (event.targetMachineId !== ctx.machineId) {
		logger.debug(
			{ eventId: event.id, targetMachineId: event.targetMachineId },
			"Ignoring spawn request for different machine",
		);
		return;
	}

	// Skip if already processed (idempotency)
	if (processedSpawnRequests.has(event.id)) {
		logger.debug({ eventId: event.id }, "Spawn request already processed");
		return;
	}

	processedSpawnRequests.add(event.id);

	logger.info(
		{ eventId: event.id, taskId: ctx.taskId, cwd: event.cwd },
		"Processing spawn request",
	);

	try {
		// Dynamic import to avoid circular dependency
		const { spawnClaudeCode } = await import("../agents/spawner.js");

		const child = await spawnClaudeCode({
			taskId: ctx.taskId,
			prompt: event.prompt,
			cwd: event.cwd,
		});

		// Track the agent
		trackAgent(ctx.taskId, child);

		// Write spawn_started event
		// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires any for change callback
		handle.change((doc: any) => {
			doc.events.push({
				type: "spawn_started",
				id: `spawn-started-${event.id}`,
				actor: "daemon",
				timestamp: Date.now(),
				inboxWorthy: null,
				inboxFor: null,
				requestId: event.id,
				pid: child.pid ?? 0,
			});
		});

		logger.info(
			{ eventId: event.id, taskId: ctx.taskId, pid: child.pid },
			"Agent spawned successfully",
		);

		// Track process exit
		child.once("exit", (exitCode) => {
			// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires any for change callback
			handle.change((doc: any) => {
				doc.events.push({
					type: "spawn_completed",
					id: `spawn-completed-${event.id}`,
					actor: "daemon",
					timestamp: Date.now(),
					inboxWorthy: null,
					inboxFor: null,
					requestId: event.id,
					exitCode: exitCode ?? 0,
				});
			});
		});
	} catch (error) {
		logger.error({ eventId: event.id, error }, "Failed to spawn agent");

		// Write spawn_failed event
		// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires any for change callback
		handle.change((doc: any) => {
			doc.events.push({
				type: "spawn_failed",
				id: `spawn-failed-${event.id}`,
				actor: "daemon",
				timestamp: Date.now(),
				inboxWorthy: null,
				inboxFor: null,
				requestId: event.id,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	}
}

/**
 * Subscribe to events on a task document.
 * Sets up Loro subscription to watch for spawn_requested events.
 */
export function subscribeToEvents(
	handle: HandleWithEphemerals<TaskDocumentShape, Record<string, never>>,
	ctx: EventHandlerContext,
): () => void {
	logger.debug({ taskId: ctx.taskId }, "Subscribing to task events");

	// Track the last seen event count to only process new events
	let lastSeenEventCount = 0;

	const unsubscribe = handle.subscribe(
		// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires any for subscribe selector
		(doc: any) => doc.events,
		// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires any for subscribe callback
		(events: any) => {
			// Get all events as array
			const eventArray = events.toArray() as TaskEvent[];
			const newEvents = eventArray.slice(lastSeenEventCount);
			lastSeenEventCount = eventArray.length;

			// Process new spawn_requested events
			for (const event of newEvents) {
				if (isSpawnRequestedEvent(event)) {
					handleSpawnRequested(event, ctx, handle).catch((error) => {
						logger.error(
							{ error, eventId: event.id },
							"Error handling spawn request",
						);
					});
				}
			}
		},
	);

	return unsubscribe;
}

/**
 * Clear processed spawn requests (for testing).
 */
export function clearProcessedSpawnRequests(): void {
	processedSpawnRequests.clear();
}
