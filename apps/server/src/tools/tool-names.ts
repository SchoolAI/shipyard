/**
 * Centralized tool name constants for type safety.
 * Use these when referencing tool names in responses or other tools.
 */
export const TOOL_NAMES = {
  ADD_ARTIFACT: 'add_artifact',
  COMPLETE_TASK: 'complete_task',
  CREATE_PLAN: 'create_plan',
  READ_PLAN: 'read_plan',
  SETUP_REVIEW_NOTIFICATION: 'setup_review_notification',
  UPDATE_BLOCK_CONTENT: 'update_block_content',
  UPDATE_PLAN: 'update_plan',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
