/**
 * MCP tools registry.
 *
 * Exports all Shipyard MCP tools for registration with the server.
 * Tools are ported from apps/server-legacy/src/tools/.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import type { McpServer } from '../index.js';
import { registerAddArtifactTool } from './add-artifact.js';
import { registerCompleteTaskTool } from './complete-task.js';
import { registerCreateTaskTool } from './create-task.js';
import { registerExecuteCodeTool } from './execute-code.js';
import { registerLinkPRTool } from './link-pr.js';
import { registerPostUpdateTool } from './post-update.js';
import { registerReadDiffCommentsTool } from './read-diff-comments.js';
import { registerReadTaskTool } from './read-task.js';
import { registerRegenerateSessionTokenTool } from './regenerate-session-token.js';
import { registerReplyToDiffCommentTool } from './reply-to-diff-comment.js';
import { registerReplyToThreadCommentTool } from './reply-to-thread-comment.js';
import { registerSetupReviewNotificationTool } from './setup-review-notification.js';
import { registerUpdateBlockContentTool } from './update-block-content.js';
import { registerUpdateTaskTool } from './update-task.js';

/**
 * All tool registration functions.
 */
const TOOL_REGISTRATIONS = [
  registerExecuteCodeTool,
  registerCreateTaskTool,
  registerReadTaskTool,
  registerUpdateTaskTool,
  registerAddArtifactTool,
  registerCompleteTaskTool,
  registerLinkPRTool,
  registerPostUpdateTool,
  registerReadDiffCommentsTool,
  registerReplyToDiffCommentTool,
  registerReplyToThreadCommentTool,
  registerUpdateBlockContentTool,
  registerRegenerateSessionTokenTool,
  registerSetupReviewNotificationTool,
] as const;

/**
 * Register all Shipyard tools with the MCP server.
 */
export function registerTools(server: McpServer): void {
  for (const register of TOOL_REGISTRATIONS) {
    register(server);
  }
}
