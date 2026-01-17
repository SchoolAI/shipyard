/**
 * Constants for Claude Code hook integration.
 * Centralizes magic strings to prevent typos and improve maintainability.
 */

// --- Claude Code Specific Constants ---

/**
 * Claude Code tool names
 */
export const CLAUDE_TOOL_NAMES = {
  WRITE: 'Write',
  EDIT: 'Edit',
  EXIT_PLAN_MODE: 'ExitPlanMode',
  ASK_USER_QUESTION: 'AskUserQuestion',
} as const;

/**
 * MCP tool names (peer-plan specific)
 */
export const MCP_TOOL_NAMES = {
  REQUEST_USER_INPUT: 'request_user_input',
} as const;

/**
 * Claude Code permission modes
 */
export const CLAUDE_PERMISSION_MODES = {
  PLAN: 'plan',
  DEFAULT: 'default',
  ACCEPT_EDITS: 'acceptEdits',
  DONT_ASK: 'dontAsk',
  BYPASS_PERMISSIONS: 'bypassPermissions',
} as const;

/**
 * Claude Code hook event names
 */
export const CLAUDE_HOOK_EVENTS = {
  PRE_TOOL_USE: 'PreToolUse',
  POST_TOOL_USE: 'PostToolUse',
  PERMISSION_REQUEST: 'PermissionRequest',
} as const;

// --- Defaults ---

/**
 * Default agent type for peer-plan hooks
 */
export const DEFAULT_AGENT_TYPE = 'claude-code';

// Environment variables moved to config/env/

/**
 * Default plan titles
 */
export const DEFAULT_PLAN_TITLES = {
  UNTITLED: 'Untitled Plan',
  IN_PROGRESS: 'Plan in progress...',
} as const;

/**
 * HTTP request timeout in milliseconds
 */
export const REQUEST_TIMEOUT_MS = 10000; // 10 seconds
