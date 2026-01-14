/**
 * Constants for Claude Code hook integration.
 * Centralizes magic strings to prevent typos and improve maintainability.
 */

// --- Claude Code Specific Constants ---

/**
 * Directory where Claude Code stores plan files
 */
export const CLAUDE_PLANS_DIR = '/.claude/plans/';

/**
 * Claude Code tool names
 */
export const CLAUDE_TOOL_NAMES = {
  WRITE: 'Write',
  EDIT: 'Edit',
  EXIT_PLAN_MODE: 'ExitPlanMode',
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

// --- State Management ---

/**
 * State file name
 */
export const STATE_FILE_NAME = 'hook-state.json';

/**
 * Maximum age for session state before cleanup (24 hours)
 */
export const STALE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
