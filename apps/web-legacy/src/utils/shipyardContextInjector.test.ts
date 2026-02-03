/**
 * Integration tests for Shipyard context injection.
 * Tests insertion logic and message structure for various conversation shapes.
 */

import type { A2AMessage } from "@shipyard/schema";
import { describe, expect, it } from "vitest";
import { injectShipyardContext } from "./shipyardContextInjector";

const sampleOptions = {
	planId: "test-plan-123",
	sessionToken: "test-token-456",
	webUrl: "http://localhost:5173",
};

describe("shipyardContextInjector", () => {
	it("inserts context before last user message in normal conversation", () => {
		const messages: A2AMessage[] = [
			{
				messageId: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "First message" }],
				contextId: "test",
			},
			{
				messageId: "msg-2",
				role: "agent",
				parts: [{ type: "text", text: "Agent response" }],
				contextId: "test",
			},
			{
				messageId: "msg-3",
				role: "user",
				parts: [{ type: "text", text: "Last message" }],
				contextId: "test",
			},
		];

		const result = injectShipyardContext(messages, sampleOptions);

		expect(result).toHaveLength(4);
		expect(result[0]?.messageId).toBe("msg-1");
		expect(result[1]?.messageId).toBe("msg-2");
		expect(result[2]?.messageId).toContain("shipyard-context");
		expect(result[2]?.role).toBe("user");
		expect(result[3]?.messageId).toBe("msg-3");
	});

	it("prepends context when conversation has no user messages", () => {
		const messages: A2AMessage[] = [
			{
				messageId: "msg-1",
				role: "agent",
				parts: [{ type: "text", text: "Agent only message" }],
				contextId: "test",
			},
		];

		const result = injectShipyardContext(messages, sampleOptions);

		expect(result).toHaveLength(2);
		expect(result[0]?.messageId).toContain("shipyard-context");
		expect(result[0]?.role).toBe("user");
		expect(result[1]?.messageId).toBe("msg-1");
	});

	it("prepends context when conversation has only one user message", () => {
		const messages: A2AMessage[] = [
			{
				messageId: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Only message" }],
				contextId: "test",
			},
		];

		const result = injectShipyardContext(messages, sampleOptions);

		expect(result).toHaveLength(2);
		expect(result[0]?.messageId).toContain("shipyard-context");
		expect(result[1]?.messageId).toBe("msg-1");
	});

	it("prepends context to empty conversation", () => {
		const messages: A2AMessage[] = [];

		const result = injectShipyardContext(messages, sampleOptions);

		expect(result).toHaveLength(1);
		expect(result[0]?.messageId).toContain("shipyard-context");
		expect(result[0]?.role).toBe("user");
	});

	it("includes plan ID and session token in context", () => {
		const messages: A2AMessage[] = [
			{
				messageId: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Test" }],
				contextId: "test",
			},
		];

		const result = injectShipyardContext(messages, sampleOptions);

		const contextMessage = result.find((m) =>
			m?.messageId.includes("shipyard-context"),
		);
		expect(contextMessage).toBeDefined();

		const text = contextMessage?.parts?.[0];
		expect(text?.type).toBe("text");
		if (text?.type === "text") {
			expect(text.text).toContain("test-plan-123");
			expect(text.text).toContain("test-token-456");
			expect(text.text).toContain("http://localhost:5173");
		}
	});

	it("includes additional prompt when provided", () => {
		const messages: A2AMessage[] = [
			{
				messageId: "msg-1",
				role: "user",
				parts: [{ type: "text", text: "Test" }],
				contextId: "test",
			},
		];

		const result = injectShipyardContext(messages, {
			...sampleOptions,
			additionalPrompt: "Focus on performance",
		});

		const contextMessage = result.find((m) =>
			m.messageId.includes("shipyard-context"),
		);
		const text = contextMessage?.parts[0];

		if (text?.type === "text") {
			expect(text.text).toContain("Focus on performance");
		}
	});
});
