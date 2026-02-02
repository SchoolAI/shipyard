/**
 * Integration tests for Loro event handlers.
 *
 * Watches Loro doc events and triggers actions like spawning agents.
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import { describe, it } from "vitest";

describe("Event Handlers", () => {
	describe("handleSpawnRequested", () => {
		it.todo("spawns agent when targetMachineId matches");
		it.todo("ignores event when targetMachineId does not match");
		it.todo("writes spawn_started event to doc on success");
		it.todo("writes spawn_failed event on spawn error");
		it.todo("passes prompt and cwd to spawner");
	});

	describe("subscribeToEvents", () => {
		it.todo("subscribes to Loro doc events");
		it.todo("filters for spawn_requested events");
		it.todo("returns unsubscribe function");
		it.todo("stops receiving events after unsubscribe");
	});
});
