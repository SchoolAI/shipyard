import { describe, expect, it } from "vitest";
import {
	type A2AMessage,
	A2AMessageSchema,
	type ClaudeCodeMessage,
	ClaudeCodeMessageSchema,
	claudeCodeToA2A,
	parseClaudeCodeTranscriptString,
	summarizeA2AConversation,
	validateA2AMessages,
} from "./conversation-export.js";

/**
 * Sample Claude Code transcript data for testing.
 * Represents a realistic conversation with text, tool use, and tool result blocks.
 */
const sampleClaudeCodeMessages: ClaudeCodeMessage[] = [
	{
		sessionId: "test-session-123",
		type: "user",
		message: {
			role: "user",
			content: [
				{
					type: "text",
					text: "Can you read the package.json file?",
				},
			],
		},
		uuid: "msg-001",
		timestamp: "2026-01-13T10:00:00.000Z",
	},
	{
		sessionId: "test-session-123",
		type: "assistant",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "I'll read the package.json file for you.",
				},
				{
					type: "tool_use",
					id: "tool-001",
					name: "Read",
					input: { file_path: "/project/package.json" },
				},
			],
			id: "resp-001",
			model: "claude-sonnet-4-20250514",
			usage: {
				input_tokens: 100,
				output_tokens: 50,
			},
		},
		uuid: "msg-002",
		timestamp: "2026-01-13T10:00:01.000Z",
		parentUuid: "msg-001",
		costUSD: 0.0015,
		durationMs: 1200,
	},
	{
		sessionId: "test-session-123",
		type: "user",
		message: {
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "tool-001",
					content: '{\n  "name": "test-project",\n  "version": "1.0.0"\n}',
					is_error: false,
				},
			],
		},
		uuid: "msg-003",
		timestamp: "2026-01-13T10:00:02.000Z",
		parentUuid: "msg-002",
	},
	{
		sessionId: "test-session-123",
		type: "assistant",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: 'The package.json shows this is a project named "test-project" at version 1.0.0.',
				},
			],
			id: "resp-002",
			model: "claude-sonnet-4-20250514",
			usage: {
				input_tokens: 150,
				output_tokens: 30,
			},
		},
		uuid: "msg-004",
		timestamp: "2026-01-13T10:00:03.000Z",
		parentUuid: "msg-003",
		costUSD: 0.001,
		durationMs: 800,
	},
	{
		sessionId: "test-session-123",
		type: "summary",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "User asked to read package.json. Agent read and explained contents.",
				},
			],
		},
		uuid: "msg-005",
		timestamp: "2026-01-13T10:00:04.000Z",
		parentUuid: "msg-004",
	},
];

/**
 * Creates a valid JSONL string from message array
 */
function createJSONL(messages: ClaudeCodeMessage[]): string {
	return messages.map((m) => JSON.stringify(m)).join("\n");
}

describe("ClaudeCodeMessageSchema", () => {
	it("validates a user message with text content", () => {
		const msg = sampleClaudeCodeMessages[0];
		const result = ClaudeCodeMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("validates an assistant message with tool_use", () => {
		const msg = sampleClaudeCodeMessages[1];
		const result = ClaudeCodeMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("validates a message with tool_result", () => {
		const msg = sampleClaudeCodeMessages[2];
		const result = ClaudeCodeMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("validates a summary message", () => {
		const msg = sampleClaudeCodeMessages[4];
		const result = ClaudeCodeMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("rejects messages with missing required fields", () => {
		const invalid = {
			sessionId: "test",
		};
		const result = ClaudeCodeMessageSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});

	it("rejects messages with invalid type enum", () => {
		const invalid = {
			...sampleClaudeCodeMessages[0],
			type: "invalid",
		};
		const result = ClaudeCodeMessageSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});
});

describe("parseClaudeCodeTranscriptString", () => {
	it("parses valid JSONL content", () => {
		const content = createJSONL(sampleClaudeCodeMessages);
		const result = parseClaudeCodeTranscriptString(content);

		expect(result.messages).toHaveLength(5);
		expect(result.errors).toHaveLength(0);
	});

	it("handles empty content", () => {
		const result = parseClaudeCodeTranscriptString("");

		expect(result.messages).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it("handles content with only whitespace", () => {
		const result = parseClaudeCodeTranscriptString("  \n\n  \n  ");

		expect(result.messages).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it("captures parse errors for malformed JSON", () => {
		const content = `${JSON.stringify(sampleClaudeCodeMessages[0])}\n{invalid json}\n${JSON.stringify(sampleClaudeCodeMessages[1])}`;
		const result = parseClaudeCodeTranscriptString(content);

		expect(result.messages).toHaveLength(2);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.line).toBe(2);
		expect(result.errors[0]?.error).toContain("JSON parse error");
	});

	it("captures validation errors for invalid schema", () => {
		const validMsg = JSON.stringify(sampleClaudeCodeMessages[0]);
		const invalidMsg = JSON.stringify({
			sessionId: "test",
			invalid: "structure",
		});
		const content = `${validMsg}\n${invalidMsg}`;

		const result = parseClaudeCodeTranscriptString(content);

		expect(result.messages).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.line).toBe(2);
		expect(result.errors[0]?.error).toContain("Validation failed");
	});

	it("preserves message order", () => {
		const content = createJSONL(sampleClaudeCodeMessages);
		const result = parseClaudeCodeTranscriptString(content);

		expect(result.messages[0]?.uuid).toBe("msg-001");
		expect(result.messages[1]?.uuid).toBe("msg-002");
		expect(result.messages[2]?.uuid).toBe("msg-003");
	});
});

describe("claudeCodeToA2A", () => {
	it("converts messages and filters out summaries", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");

		expect(result).toHaveLength(4);
	});

	it("sets contextId on all messages", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");

		for (const msg of result) {
			expect(msg.contextId).toBe("plan-123");
		}
	});

	it("correctly maps user/assistant roles", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");

		expect(result[0]?.role).toBe("user");
		expect(result[1]?.role).toBe("agent");
		expect(result[2]?.role).toBe("user");
		expect(result[3]?.role).toBe("agent");
	});

	it("converts text content to A2A text parts", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const firstMsg = result[0];

		expect(firstMsg?.parts).toHaveLength(1);
		expect(firstMsg?.parts[0]?.type).toBe("text");
		if (firstMsg?.parts[0]?.type === "text") {
			expect(firstMsg.parts[0].text).toBe(
				"Can you read the package.json file?",
			);
		}
	});

	it("converts tool_use to A2A data part with toolUse structure", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const assistantMsg = result[1];

		expect(assistantMsg?.parts).toHaveLength(2);

		const toolUsePart = assistantMsg?.parts[1];
		expect(toolUsePart?.type).toBe("data");
		if (toolUsePart?.type === "data") {
			const data = toolUsePart.data as {
				toolUse: { name: string; id: string; input: unknown };
			};
			expect(data.toolUse.name).toBe("Read");
			expect(data.toolUse.id).toBe("tool-001");
			expect(data.toolUse.input).toEqual({
				file_path: "/project/package.json",
			});
		}
	});

	it("converts tool_result to A2A data part with toolResult structure", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const toolResultMsg = result[2];

		expect(toolResultMsg?.parts).toHaveLength(1);

		const toolResultPart = toolResultMsg?.parts[0];
		expect(toolResultPart?.type).toBe("data");
		if (toolResultPart?.type === "data") {
			const data = toolResultPart.data as {
				toolResult: { toolUseId: string; content: unknown; isError: boolean };
			};
			expect(data.toolResult.toolUseId).toBe("tool-001");
			expect(data.toolResult.isError).toBe(false);
		}
	});

	it("preserves message ID as messageId", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");

		expect(result[0]?.messageId).toBe("msg-001");
		expect(result[1]?.messageId).toBe("msg-002");
	});

	it("includes metadata with timestamp, platform, and model info", () => {
		const result = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const assistantMsg = result[1];

		expect(assistantMsg?.metadata?.timestamp).toBe("2026-01-13T10:00:01.000Z");
		expect(assistantMsg?.metadata?.platform).toBe("claude-code");
		expect(assistantMsg?.metadata?.parentMessageId).toBe("msg-001");
		expect(assistantMsg?.metadata?.model).toBe("claude-sonnet-4-20250514");
		expect(assistantMsg?.metadata?.costUSD).toBe(0.0015);
		expect(assistantMsg?.metadata?.durationMs).toBe(1200);
	});

	it("handles empty messages array", () => {
		const result = claudeCodeToA2A([], "plan-123");
		expect(result).toHaveLength(0);
	});

	it("handles messages with only summaries", () => {
		const onlySummary = sampleClaudeCodeMessages.filter(
			(m) => m.type === "summary",
		);
		const result = claudeCodeToA2A(onlySummary, "plan-123");
		expect(result).toHaveLength(0);
	});
});

describe("validateA2AMessages", () => {
	it("validates correct A2A messages", () => {
		const messages = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const result = validateA2AMessages(messages);

		expect(result.valid).toHaveLength(4);
		expect(result.errors).toHaveLength(0);
	});

	it("filters out invalid messages", () => {
		const valid = claudeCodeToA2A(
			sampleClaudeCodeMessages.slice(0, 2),
			"plan-123",
		);
		const invalid = { not: "a valid message" };

		const result = validateA2AMessages([...valid, invalid]);

		expect(result.valid).toHaveLength(2);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.index).toBe(2);
	});

	it("handles empty array", () => {
		const result = validateA2AMessages([]);
		expect(result.valid).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});
});

describe("A2AMessageSchema", () => {
	it("validates a minimal valid message", () => {
		const msg: A2AMessage = {
			messageId: "test-id",
			role: "user",
			parts: [{ type: "text", text: "Hello" }],
		};

		const result = A2AMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("validates message with all optional fields", () => {
		const msg: A2AMessage = {
			messageId: "test-id",
			role: "agent",
			parts: [{ type: "text", text: "Response" }],
			contextId: "ctx-123",
			taskId: "task-456",
			referenceTaskIds: ["ref-1", "ref-2"],
			metadata: { custom: "data" },
			extensions: ["ext-1"],
		};

		const result = A2AMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("validates message with data parts", () => {
		const msg: A2AMessage = {
			messageId: "test-id",
			role: "agent",
			parts: [
				{
					type: "data",
					data: { toolUse: { name: "test", id: "1", input: {} } },
				},
			],
		};

		const result = A2AMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("validates message with file parts", () => {
		const msg: A2AMessage = {
			messageId: "test-id",
			role: "user",
			parts: [
				{
					type: "file",
					uri: "file:///path/to/file.png",
					mediaType: "image/png",
					name: "screenshot.png",
				},
			],
		};

		const result = A2AMessageSchema.safeParse(msg);
		expect(result.success).toBe(true);
	});

	it("rejects invalid role", () => {
		const invalid = {
			messageId: "test-id",
			role: "system",
			parts: [],
		};

		const result = A2AMessageSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});

	it("rejects invalid part type", () => {
		const invalid = {
			messageId: "test-id",
			role: "user",
			parts: [{ type: "invalid", content: "test" }],
		};

		const result = A2AMessageSchema.safeParse(invalid);
		expect(result.success).toBe(false);
	});
});

describe("summarizeA2AConversation", () => {
	it("extracts title from first user message", () => {
		const messages = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const result = summarizeA2AConversation(messages);

		expect(result.title).toBe("Can you read the package.json file?");
	});

	it("truncates long titles with ellipsis", () => {
		const longMessage: ClaudeCodeMessage = {
			sessionId: "test",
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "text",
						text: "This is a very long message that should be truncated because it exceeds the maximum title length of 50 characters",
					},
				],
			},
			uuid: "msg-long",
			timestamp: "2026-01-13T10:00:00.000Z",
		};

		const a2a = claudeCodeToA2A([longMessage], "plan-123");
		const result = summarizeA2AConversation(a2a);

		expect(result.title.length).toBe(53);
		expect(result.title.endsWith("...")).toBe(true);
	});

	it("falls back to default title when no user message", () => {
		const agentOnly: ClaudeCodeMessage = {
			sessionId: "test",
			type: "assistant",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Hello" }],
			},
			uuid: "msg-agent",
			timestamp: "2026-01-13T10:00:00.000Z",
		};

		const a2a = claudeCodeToA2A([agentOnly], "plan-123");
		const result = summarizeA2AConversation(a2a);

		expect(result.title).toBe("Imported Conversation");
	});

	it("includes summary text with message previews", () => {
		const messages = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const result = summarizeA2AConversation(messages);

		expect(result.text).toContain("User:");
		expect(result.text).toContain("Agent:");
	});

	it("limits summary to maxMessages", () => {
		const messages = claudeCodeToA2A(sampleClaudeCodeMessages, "plan-123");
		const result = summarizeA2AConversation(messages, 2);

		expect(result.text).toContain("... and 2 more messages");
	});

	it("handles tool interactions in summary", () => {
		const toolOnlyMsg: ClaudeCodeMessage = {
			sessionId: "test",
			type: "assistant",
			message: {
				role: "assistant",
				content: [
					{ type: "tool_use", id: "t1", name: "Read", input: {} },
					{ type: "tool_use", id: "t2", name: "Write", input: {} },
				],
			},
			uuid: "msg-tool",
			timestamp: "2026-01-13T10:00:00.000Z",
		};

		const a2a = claudeCodeToA2A([toolOnlyMsg], "plan-123");
		const result = summarizeA2AConversation(a2a);

		expect(result.text).toContain("tool interaction");
	});

	it("handles empty messages array", () => {
		const result = summarizeA2AConversation([]);

		expect(result.title).toBe("Imported Conversation");
		expect(result.text).toBe("");
	});
});

describe("Round-trip validation", () => {
	it("parsed messages can be converted to A2A and back-validated", () => {
		const content = createJSONL(sampleClaudeCodeMessages);
		const parsed = parseClaudeCodeTranscriptString(content);

		expect(parsed.errors).toHaveLength(0);

		const a2a = claudeCodeToA2A(parsed.messages, "plan-123");

		const validated = validateA2AMessages(a2a);
		expect(validated.errors).toHaveLength(0);
		expect(validated.valid).toHaveLength(a2a.length);
	});

	it("preserves all message content through conversion", () => {
		const content = createJSONL([
			sampleClaudeCodeMessages[0] as ClaudeCodeMessage,
		]);
		const parsed = parseClaudeCodeTranscriptString(content);
		const a2a = claudeCodeToA2A(parsed.messages, "plan-123");

		const originalText = sampleClaudeCodeMessages[0]?.message.content[0];
		if (originalText?.type === "text") {
			const a2aTextPart = a2a[0]?.parts[0];
			if (a2aTextPart?.type === "text") {
				expect(a2aTextPart.text).toBe(originalText.text);
			}
		}
	});
});
