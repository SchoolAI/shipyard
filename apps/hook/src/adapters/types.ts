/**
 * Abstract adapter layer for agent integrations.
 * Allows different agent systems (Claude Code, Open Agents, etc.) to plug into shipyard.
 */

import type { AgentPresence, ReviewFeedback } from '@shipyard/schema';

export type { AgentPresence, ReviewFeedback };

export interface AgentAdapter {
  readonly name: string;
  parseInput(stdin: string): AdapterEvent;
  formatOutput(response: CoreResponse): string;
}

export type AdapterEvent =
  | PlanStartEvent
  | ContentUpdateEvent
  | PlanExitEvent
  | PostExitEvent
  | DisconnectEvent
  | ToolDenyEvent
  | PassthroughEvent;

export interface PlanStartEvent {
  type: 'plan_start';
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface ContentUpdateEvent {
  type: 'content_update';
  sessionId: string;
  filePath: string;
  content: string;
}

export interface PlanExitEvent {
  type: 'plan_exit';
  sessionId: string;
  planContent?: string;
  metadata?: Record<string, unknown>;
}

export interface PostExitEvent {
  type: 'post_exit';
  sessionId: string;
  toolName: string;
}

export interface DisconnectEvent {
  type: 'disconnect';
  sessionId: string;
}

export interface ToolDenyEvent {
  type: 'tool_deny';
  reason: string;
}

/** Event is not relevant to shipyard, pass through */
export interface PassthroughEvent {
  type: 'passthrough';
}

export interface CoreResponse {
  allow: boolean;
  message?: string;
  feedback?: ReviewFeedback[];
  planId?: string;
  url?: string;
  sessionToken?: string;
  hookType?: 'permission_request' | 'post_tool_use' | 'tool_deny';
  additionalContext?: string;
  denyReason?: string;
}

// Note: AgentPresence is re-exported from @shipyard/schema above
