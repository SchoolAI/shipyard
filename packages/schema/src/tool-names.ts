/**
 * Centralized tool name constants for type safety.
 * Use these when referencing tool names in responses or other tools.
 *
 * This is the single source of truth for MCP tool names across all packages.
 */
export const TOOL_NAMES = {
  ADD_ARTIFACT: 'add_artifact',
  COMPLETE_TASK: 'complete_task',
  CREATE_TASK: 'create_task',
  EXECUTE_CODE: 'execute_code',
  LINK_PR: 'link_pr',
  READ_TASK: 'read_task',
  REGENERATE_SESSION_TOKEN: 'regenerate_session_token',
  REQUEST_USER_INPUT: 'request_user_input',
  SETUP_REVIEW_NOTIFICATION: 'setup_review_notification',
  UPDATE_BLOCK_CONTENT: 'update_block_content',
  UPDATE_TASK: 'update_task',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
