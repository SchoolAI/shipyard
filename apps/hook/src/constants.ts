export const CLAUDE_TOOL_NAMES = {
  WRITE: 'Write',
  EDIT: 'Edit',
  EXIT_PLAN_MODE: 'ExitPlanMode',
  ASK_USER_QUESTION: 'AskUserQuestion',
} as const;

/**
 * MCP tool names (shipyard specific)
 */
export const MCP_TOOL_NAMES = {
  REQUEST_USER_INPUT: 'request_user_input',
} as const;

export const CLAUDE_PERMISSION_MODES = {
  PLAN: 'plan',
  DEFAULT: 'default',
  ACCEPT_EDITS: 'acceptEdits',
  DONT_ASK: 'dontAsk',
  BYPASS_PERMISSIONS: 'bypassPermissions',
} as const;

export const CLAUDE_HOOK_EVENTS = {
  PRE_TOOL_USE: 'PreToolUse',
  POST_TOOL_USE: 'PostToolUse',
  PERMISSION_REQUEST: 'PermissionRequest',
} as const;

/**
 * Default agent type for shipyard hooks
 */
export const DEFAULT_AGENT_TYPE = 'claude-code';

export const DEFAULT_PLAN_TITLES = {
  UNTITLED: 'Untitled Plan',
  IN_PROGRESS: 'Plan in progress...',
} as const;

export const REQUEST_TIMEOUT_MS = 10000;
