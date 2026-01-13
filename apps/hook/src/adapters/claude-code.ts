/**
 * Claude Code adapter implementation.
 * Translates between Claude Code hook JSON format and our common event types.
 */

import { formatThreadsForLLM } from '@peer-plan/schema';
import { z } from 'zod';
import { CLAUDE_HOOK_EVENTS, CLAUDE_PERMISSION_MODES, CLAUDE_TOOL_NAMES } from '../constants.js';
import type {
  AdapterEvent,
  AgentAdapter,
  CoreResponse,
  PostExitEvent,
  ReviewFeedback,
} from './types.js';

// --- Claude Code Hook Input Schemas ---

/**
 * Common fields present in all Claude Code hook inputs.
 */
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

// --- Event Handlers ---

function handlePreToolUse(_input: ClaudeCodeHookInput): AdapterEvent {
  // Not handling Write/Edit - using blocking approach with ExitPlanMode only
  return { type: 'passthrough' };
}

/**
 * Schema for ExitPlanMode tool input - contains the full plan content
 */
const ExitPlanModeToolInputSchema = z.object({
  plan: z.string(),
});

function handlePermissionRequest(input: ClaudeCodeHookInput): AdapterEvent {
  const sessionId = input.session_id;
  const toolName = input.tool_name;

  // ExitPlanMode triggers review - gets full plan content
  if (toolName === CLAUDE_TOOL_NAMES.EXIT_PLAN_MODE) {
    const parsed = ExitPlanModeToolInputSchema.safeParse(input.tool_input);
    if (!parsed.success) {
      // No plan content - just do status check
      return { type: 'plan_exit', sessionId };
    }

    // Return plan_exit with full plan content for review + origin metadata
    return {
      type: 'plan_exit',
      sessionId,
      planContent: parsed.data.plan,
      metadata: {
        originSessionId: input.session_id,
        originTranscriptPath: input.transcript_path,
        originCwd: input.cwd,
      },
    };
  }

  return { type: 'passthrough' };
}

function handlePostToolUse(input: ClaudeCodeHookInput): AdapterEvent {
  const sessionId = input.session_id;
  const toolName = input.tool_name;

  // After ExitPlanMode completes, inject session context
  if (toolName === CLAUDE_TOOL_NAMES.EXIT_PLAN_MODE) {
    return {
      type: 'post_exit',
      sessionId,
      toolName,
    } as PostExitEvent;
  }

  return { type: 'passthrough' };
}

// --- Adapter Implementation ---

export const claudeCodeAdapter: AgentAdapter = {
  name: 'claude-code',

  parseInput(stdin: string): AdapterEvent {
    let input: ClaudeCodeHookInput;

    try {
      const parsed = JSON.parse(stdin);
      input = ClaudeCodeHookBaseSchema.parse(parsed);
    } catch {
      return { type: 'passthrough' };
    }

    // Only handle plan mode events
    if (input.permission_mode !== CLAUDE_PERMISSION_MODES.PLAN) {
      return { type: 'passthrough' };
    }

    // Dispatch to appropriate handler
    if (input.hook_event_name === CLAUDE_HOOK_EVENTS.PRE_TOOL_USE) {
      return handlePreToolUse(input);
    }

    if (input.hook_event_name === CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST) {
      return handlePermissionRequest(input);
    }

    if (input.hook_event_name === CLAUDE_HOOK_EVENTS.POST_TOOL_USE) {
      return handlePostToolUse(input);
    }

    return { type: 'passthrough' };
  },

  formatOutput(response: CoreResponse): string {
    // Handle PostToolUse responses - inject additionalContext
    if (response.hookType === 'post_tool_use') {
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: CLAUDE_HOOK_EVENTS.POST_TOOL_USE,
          additionalContext: response.additionalContext || '',
        },
      });
    }

    // Handle PermissionRequest responses
    if (response.allow) {
      // Allow the operation
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST,
          decision: {
            behavior: 'allow',
          },
        },
      });
    }

    // Deny the operation
    const message = response.feedback?.length
      ? formatFeedback(response.feedback)
      : response.message || 'Changes requested';

    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST,
        decision: {
          behavior: 'deny',
          message,
        },
      },
    });
  },
};

// --- Helpers ---

function formatFeedback(feedback: ReviewFeedback[]): string {
  if (!feedback.length) {
    return 'Changes requested. Check the plan for reviewer comments.';
  }

  // Convert ReviewFeedback[] to Thread[] format for shared formatter
  const threads = feedback.map((f) => ({
    id: f.threadId,
    comments: f.comments.map((c) => ({
      id: c.author, // Use author as id for now
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
