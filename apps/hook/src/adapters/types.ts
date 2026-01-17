/**
 * Abstract adapter layer for agent integrations.
 * Allows different agent systems (Claude Code, Open Agents, etc.) to plug into peer-plan.
 */

import type { AgentPresence, ReviewFeedback } from '@peer-plan/schema';

export type { AgentPresence, ReviewFeedback };

// --- Agent Adapter Interface ---

/**
 * Interface for agent-specific adapters.
 * Each adapter translates between their agent's hook format and our common event types.
 */
export interface AgentAdapter {
  /** Unique identifier for this adapter type */
  readonly name: string;

  /** Parse raw stdin input into a common adapter event */
  parseInput(stdin: string): AdapterEvent;

  /** Format a core response into the agent-specific output format */
  formatOutput(response: CoreResponse): string;
}

// --- Common Event Types ---

/**
 * Events that adapters emit after parsing agent-specific input.
 * These are agent-agnostic and processed by the shared core logic.
 */
export type AdapterEvent =
  | PlanStartEvent
  | ContentUpdateEvent
  | PlanExitEvent
  | PostExitEvent
  | DisconnectEvent
  | ToolTransformEvent
  | PassthroughEvent;

/** Agent is starting/entering plan mode */
export interface PlanStartEvent {
  type: 'plan_start';
  sessionId: string;
  /** Agent-specific metadata (e.g., cwd, transcript path) */
  metadata?: Record<string, unknown>;
}

/** Agent is writing/editing plan content */
export interface ContentUpdateEvent {
  type: 'content_update';
  sessionId: string;
  /** Path to the plan file being written */
  filePath: string;
  /** The new content of the plan file */
  content: string;
}

/** Agent is trying to exit plan mode */
export interface PlanExitEvent {
  type: 'plan_exit';
  sessionId: string;
  /** Full plan content from ExitPlanMode (if available) */
  planContent?: string;
  /** Origin metadata for conversation export (session ID, transcript path, etc.) */
  metadata?: Record<string, unknown>;
}

/** PostToolUse event after ExitPlanMode completes - used to inject session context */
export interface PostExitEvent {
  type: 'post_exit';
  sessionId: string;
  /** Tool name that just completed */
  toolName: string;
}

/** Agent session is ending */
export interface DisconnectEvent {
  type: 'disconnect';
  sessionId: string;
}

/** Tool call should be transformed to a different tool */
export interface ToolTransformEvent {
  type: 'tool_transform';
  /** Original tool name being intercepted */
  originalTool: string;
  /** New tool name to call instead */
  newTool: string;
  /** New tool input parameters */
  newInput: Record<string, unknown>;
}

/** Event is not relevant to peer-plan, pass through */
export interface PassthroughEvent {
  type: 'passthrough';
}

// --- Core Response Types ---

/**
 * Response from core logic back to the adapter.
 * Adapters translate this into agent-specific output format.
 */
export interface CoreResponse {
  /** Whether to allow the operation to proceed */
  allow: boolean;
  /** Optional message to show the agent/user */
  message?: string;
  /** Review feedback if changes were requested */
  feedback?: ReviewFeedback[];
  /** Plan ID (returned on plan creation/approval) */
  planId?: string;
  /** URL to the plan (returned on plan creation/approval) */
  url?: string;
  /** Session token for MCP tool calls (returned on approval) */
  sessionToken?: string;
  /** Hook type to determine output format */
  hookType?: 'permission_request' | 'post_tool_use' | 'tool_transform';
  /** Additional context to inject (for PostToolUse) */
  additionalContext?: string;
  /** Transformed tool name (for tool_transform) */
  transformedTool?: string;
  /** Transformed tool input (for tool_transform) */
  transformedInput?: Record<string, unknown>;
}

// Note: AgentPresence is re-exported from @peer-plan/schema above
