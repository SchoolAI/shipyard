/**
 * Claude Code adapter implementation.
 * Translates between Claude Code hook JSON format and our common event types.
 */

import { z } from 'zod';
import {
  CLAUDE_HOOK_EVENTS,
  CLAUDE_PERMISSION_MODES,
  CLAUDE_PLANS_DIR,
  CLAUDE_TOOL_NAMES,
} from '../constants.js';
import type { AdapterEvent, AgentAdapter, CoreResponse, ReviewFeedback } from './types.js';

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

/**
 * Specific schemas for tool inputs
 */
const WriteToolInputSchema = z.object({
  file_path: z.string(),
  content: z.string(),
});

const EditToolInputSchema = z.object({
  file_path: z.string(),
  old_string: z.string().optional(),
  new_string: z.string().optional(),
});

// --- Event Handlers ---

function handlePreToolUse(input: ClaudeCodeHookInput): AdapterEvent {
  const sessionId = input.session_id;
  const toolName = input.tool_name;

  // Write in plan mode triggers content update (or plan creation if first write)
  if (toolName === CLAUDE_TOOL_NAMES.WRITE) {
    const parsed = WriteToolInputSchema.safeParse(input.tool_input);
    if (!parsed.success) return { type: 'passthrough' };

    const { file_path: filePath, content } = parsed.data;

    // Check if writing to a plan file
    const isPlanFile = filePath.includes(CLAUDE_PLANS_DIR);

    if (isPlanFile) {
      return {
        type: 'content_update',
        sessionId,
        filePath,
        content,
      };
    }
  }

  // Edit in plan mode triggers content update
  if (toolName === CLAUDE_TOOL_NAMES.EDIT) {
    const parsed = EditToolInputSchema.safeParse(input.tool_input);
    if (!parsed.success) return { type: 'passthrough' };

    const { file_path: filePath, new_string: newString } = parsed.data;
    if (!newString) return { type: 'passthrough' };

    // Check if editing a plan file
    const isPlanFile = filePath.includes(CLAUDE_PLANS_DIR);

    if (isPlanFile) {
      return {
        type: 'content_update',
        sessionId,
        filePath,
        content: newString,
      };
    }
  }

  return { type: 'passthrough' };
}

function handlePermissionRequest(input: ClaudeCodeHookInput): AdapterEvent {
  const sessionId = input.session_id;
  const toolName = input.tool_name;

  // ExitPlanMode triggers review check
  if (toolName === CLAUDE_TOOL_NAMES.EXIT_PLAN_MODE) {
    return { type: 'plan_exit', sessionId };
  }

  return { type: 'passthrough' };
}

// --- Claude Code Hook Output Schemas ---

/**
 * Output format for Claude Code hooks.
 */
interface ClaudeCodeHookOutput {
  continue: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    message?: string;
  };
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

    return { type: 'passthrough' };
  },

  formatOutput(response: CoreResponse): string {
    const output: ClaudeCodeHookOutput = {
      continue: true,
    };

    if (response.allow) {
      // Allow the operation
      output.hookSpecificOutput = {
        hookEventName: CLAUDE_HOOK_EVENTS.PRE_TOOL_USE,
        permissionDecision: 'allow',
      };

      if (response.message) {
        output.hookSpecificOutput.permissionDecisionReason = response.message;
      }
    } else {
      // Deny the operation (e.g., waiting for review)
      output.hookSpecificOutput = {
        hookEventName: CLAUDE_HOOK_EVENTS.PERMISSION_REQUEST,
        permissionDecision: 'deny',
        message: response.message,
      };

      // Format feedback if present
      if (response.feedback?.length) {
        const feedbackText = formatFeedback(response.feedback);
        output.hookSpecificOutput.message = feedbackText;
      }
    }

    return JSON.stringify(output);
  },
};

// --- Helpers ---

function formatFeedback(feedback: ReviewFeedback[]): string {
  if (!feedback.length) {
    return 'Changes requested. Check the plan for reviewer comments.';
  }

  const lines = feedback.map((f) => {
    const comments = f.comments.map((c) => `  - ${c.author}: ${c.content}`).join('\n');
    return `Block ${f.blockId ?? 'unknown'}:\n${comments}`;
  });

  return `Changes requested:\n\n${lines.join('\n\n')}`;
}
