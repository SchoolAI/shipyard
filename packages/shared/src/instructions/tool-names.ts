/**
 * Local copy of tool name constants for instructions.
 *
 * This is a LOCAL COPY of @shipyard/schema/tool-names.ts to avoid external
 * import issues when bundling. The instructions package is consumed by the
 * hook which needs to bundle everything standalone for npx.
 *
 * NOTE: If tool names change in @shipyard/schema, this file must be updated manually.
 * This is acceptable because tool names are stable API and rarely change.
 */
export const TOOL_NAMES = {
  ADD_ARTIFACT: 'add_artifact',
  ADD_PR_REVIEW_COMMENT: 'add_pr_review_comment',
  COMPLETE_TASK: 'complete_task',
  CREATE_PLAN: 'create_plan',
  EXECUTE_CODE: 'execute_code',
  LINK_PR: 'link_pr',
  READ_PLAN: 'read_plan',
  REGENERATE_SESSION_TOKEN: 'regenerate_session_token',
  REQUEST_USER_INPUT: 'request_user_input',
  SETUP_REVIEW_NOTIFICATION: 'setup_review_notification',
  UPDATE_BLOCK_CONTENT: 'update_block_content',
  UPDATE_PLAN: 'update_plan',
} as const;
