/**
 * Claude Code adapter implementation.
 * Translates between Claude Code hook JSON format and our common event types.
 */

import { formatThreadsForLLM } from "@shipyard/schema";
import { z } from "zod";
import {
	CLAUDE_HOOK_EVENTS,
	CLAUDE_PERMISSION_MODES,
	CLAUDE_TOOL_NAMES,
	TOOL_NAMES,
} from "../constants.js";
import { logger } from "../logger.js";
import type {
	AdapterEvent,
	AgentAdapter,
	CoreResponse,
	ReviewFeedback,
} from "./types.js";

const ClaudeCodeHookBaseSchema = z.object({
	session_id: z.string(),
	transcript_path: z.string().optional(),
	cwd: z.string().optional(),
	permission_mode: z.enum([
		CLAUDE_PERMISSION_MODES.DEFAULT,
		CLAUDE_PERMISSION_MODES.PLAN,
		CLAUDE_PERMISSION_MODES.ACCEPT_EDITS,
		CLAUDE_PERMISSION_MODES.DONT_ASK,
		CLAUDE_PERMISSION_MODES.BYPASS_PERMISSIONS,
	]),
	hook_event_name: z.string(),
	tool_name: z.string().optional(),
	tool_input: z.record(z.string(), z.unknown()).optional(),
});

type ClaudeCodeHookInput = z.infer<typeof ClaudeCodeHookBaseSchema>;

function handlePreToolUse(input: ClaudeCodeHookInput): AdapterEvent {
	const toolName = input.tool_name;

	if (toolName === CLAUDE_TOOL_NAMES.ASK_USER_QUESTION) {
		logger.info(
			{ toolName },
			"Blocking AskUserQuestion - redirecting to requestUserInput() in execute_code",
		);
		return {
			type: "tool_deny",
			reason:
				`BLOCKED: Use requestUserInput() inside ${TOOL_NAMES.EXECUTE_CODE} instead. ` +
				"The human is in the browser viewing your plan - that's where they expect to interact with you. " +
				"See the execute_code tool description for input types and parameters.",
		};
	}

	return { type: "passthrough" };
}

const ExitPlanModeToolInputSchema = z.object({
	plan: z.string(),
});

function handlePermissionRequest(input: ClaudeCodeHookInput): AdapterEvent {
	const sessionId = input.session_id;
	const toolName = input.tool_name;

	if (toolName === CLAUDE_TOOL_NAMES.EXIT_PLAN_MODE) {
		logger.info(
			{
				toolInput: input.tool_input,
				toolInputKeys: input.tool_input ? Object.keys(input.tool_input) : [],
			},
			"ExitPlanMode tool_input received",
		);

		const parsed = ExitPlanModeToolInputSchema.safeParse(input.tool_input);
		if (!parsed.success) {
			logger.warn(
				{ parseError: parsed.error?.issues, toolInput: input.tool_input },
				"ExitPlanMode tool_input parse failed - no plan content",
			);
			return { type: "plan_exit", sessionId };
		}

		return {
			type: "plan_exit",
			sessionId,
			planContent: parsed.data.plan,
			metadata: {
				originSessionId: input.session_id,
				originTranscriptPath: input.transcript_path,
				originCwd: input.cwd,
			},
		};
	}

	return { type: "passthrough" };
}

function handlePostToolUse(input: ClaudeCodeHookInput): AdapterEvent {
	const sessionId = input.session_id;
	const toolName = input.tool_name;

	if (toolName === CLAUDE_TOOL_NAMES.EXIT_PLAN_MODE) {
		/** toolName is narrowed to the string literal by the equality check above */
		return {
			type: "post_exit",
			sessionId,
			toolName,
		};
	}

	return { type: "passthrough" };
}

export const claudeCodeAdapter: AgentAdapter = {
	name: "claude-code",

	parseInput(stdin: string): AdapterEvent {
		let input: ClaudeCodeHookInput;

		try {
			const parsed = JSON.parse(stdin);
			input = ClaudeCodeHookBaseSchema.parse(parsed);
		} catch {
			return { type: "passthrough" };
		}

		if (input.hook_event_name === CLAUDE_HOOK_EVENTS.PRE_TOOL_USE) {
			return handlePreToolUse(input);
		}

		if (input.permission_mode !== CLAUDE_PERMISSION_MODES.PLAN) {
			return { type: "passthrough" };
		}

		if (input.hook_event_name === CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST) {
			return handlePermissionRequest(input);
		}

		if (input.hook_event_name === CLAUDE_HOOK_EVENTS.POST_TOOL_USE) {
			return handlePostToolUse(input);
		}

		return { type: "passthrough" };
	},

	formatOutput(response: CoreResponse): string {
		if (response.hookType === "tool_deny") {
			return JSON.stringify({
				hookSpecificOutput: {
					hookEventName: CLAUDE_HOOK_EVENTS.PRE_TOOL_USE,
					permissionDecision: "deny",
					permissionDecisionReason:
						response.denyReason || "Tool call denied by hook",
				},
			});
		}

		if (response.hookType === "post_tool_use") {
			return JSON.stringify({
				hookSpecificOutput: {
					hookEventName: CLAUDE_HOOK_EVENTS.POST_TOOL_USE,
					additionalContext: response.additionalContext || "",
				},
			});
		}

		if (response.allow) {
			return JSON.stringify({
				hookSpecificOutput: {
					hookEventName: CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST,
					decision: {
						behavior: "allow",
						message: response.message,
					},
				},
			});
		}

		const message = response.feedback?.length
			? formatFeedback(response.feedback)
			: response.message || "Changes requested";

		return JSON.stringify({
			hookSpecificOutput: {
				hookEventName: CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST,
				decision: {
					behavior: "deny",
					message,
				},
			},
		});
	},
};

function formatFeedback(feedback: ReviewFeedback[]): string {
	if (!feedback.length) {
		return "Changes requested. Check the plan for reviewer comments.";
	}

	const threads = feedback.map((f) => ({
		id: f.threadId,
		comments: f.comments.map((c) => ({
			id: c.author,
			userId: c.author,
			body: c.content,
			createdAt: c.createdAt,
		})),
		selectedText: f.blockId ? `Block ${f.blockId}` : undefined,
	}));

	const feedbackText = formatThreadsForLLM(threads, {
		includeResolved: false,
		selectedTextMaxLength: 100,
	});

	return `Changes requested:\n\n${feedbackText}`;
}
