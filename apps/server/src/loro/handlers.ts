/**
 * Loro event handlers.
 *
 * Watches Loro doc events and triggers actions:
 * - spawn_requested -> spawn Claude Code agent
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

// Note: Using simplified handle type to avoid Loro DocShape constraint issues
import { trackAgent } from "../agents/tracker.js";
import { logger } from "../utils/logger.js";

/**
 * Handler context with machine identity.
 */
export interface EventHandlerContext {
	machineId: string;
	taskId: string;
}

/** Spawn requested event shape - using index signature for compatibility */
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
	[key: string]: unknown;
}

/** Generic event type for type guards (single event, not array) */
interface TaskEventItem {
	type: string;
	id: string;
	[key: string]: unknown;
}

/** Track which spawn requests we've already processed */
const processedSpawnRequests = new Set<string>();

/** Max age for processed spawn requests (1 hour) */
const PROCESSED_SPAWN_REQUEST_MAX_AGE_MS = 60 * 60 * 1000;

/** Cleanup interval for processed spawn requests (5 minutes) */
const PROCESSED_SPAWN_REQUEST_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Track spawn request timestamps for cleanup */
const spawnRequestTimestamps = new Map<string, number>();

/** Cleanup timer ID */
let cleanupTimerId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic cleanup of processed spawn requests.
 * Should be called during server startup.
 */
export function startSpawnRequestCleanup(): () => void {
	if (cleanupTimerId !== null) {
		// Already running
		return () => stopSpawnRequestCleanup();
	}

	cleanupTimerId = setInterval(() => {
		const now = Date.now();
		const expiredIds: string[] = [];

		for (const [id, timestamp] of spawnRequestTimestamps) {
			if (now - timestamp > PROCESSED_SPAWN_REQUEST_MAX_AGE_MS) {
				expiredIds.push(id);
			}
		}

		for (const id of expiredIds) {
			processedSpawnRequests.delete(id);
			spawnRequestTimestamps.delete(id);
		}

		if (expiredIds.length > 0) {
			logger.debug(
				{ count: expiredIds.length },
				"Cleaned up expired spawn request IDs",
			);
		}
	}, PROCESSED_SPAWN_REQUEST_CLEANUP_INTERVAL_MS);

	return () => stopSpawnRequestCleanup();
}

/**
 * Stop the periodic cleanup of processed spawn requests.
 * Should be called during server shutdown.
 */
export function stopSpawnRequestCleanup(): void {
	if (cleanupTimerId !== null) {
		clearInterval(cleanupTimerId);
		cleanupTimerId = null;
	}
}

/**
 * Check if an event is a spawn_requested event.
 */
function isSpawnRequestedEvent(
	event: TaskEventItem,
): event is SpawnRequestedEvent {
	return event.type === "spawn_requested";
}

/**
 * Handle type for task documents.
 * Uses a simplified type to avoid complex generic constraint issues with DocShape.
 */
type TaskDocHandle = {
	// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires simplified handle type
	change: (fn: (doc: any) => void) => void;
	subscribe: (
		// biome-ignore lint/suspicious/noExplicitAny: Loro TypedDoc typing requires simplified handle type
		selector: any,
		callback: (events: { toArray: () => unknown[] }) => void,
	) => () => void;
};

/**
 * Handle a spawn_requested event.
 * Only processes if targetMachineId matches this daemon's machineId.
 */
export async function handleSpawnRequested(
	event: SpawnRequestedEvent,
	ctx: EventHandlerContext,
	handle: TaskDocHandle,
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
	spawnRequestTimestamps.set(event.id, Date.now());

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

		// Track process exit with error handling
		child.once("exit", (exitCode) => {
			try {
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
			} catch (exitError) {
				logger.error(
					{ eventId: event.id, exitCode, error: exitError },
					"Failed to write spawn_completed event",
				);
			}
		});

		// Handle process errors
		child.once("error", (processError) => {
			logger.error(
				{ eventId: event.id, error: processError },
				"Spawned process error",
			);
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
	handle: TaskDocHandle,
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
			const eventArray = events.toArray() as TaskEventItem[];
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
	spawnRequestTimestamps.clear();
}
