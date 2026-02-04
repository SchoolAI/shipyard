/**
 * MCP Tool: reply_to_diff_comment
 *
 * Replies to a specific PR diff comment or local diff comment.
 * Ported from apps/server-legacy/src/tools/reply-to-diff-comment.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { generateCommentId } from '@shipyard/loro-schema';
import { z } from 'zod';
import { getGitHubUsername } from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import type { McpServer } from '../index.js';
import { errorResponse, getTaskDocument, verifySessionToken } from './helpers.js';

/** Tool name constant */
const TOOL_NAME = 'reply_to_diff_comment';

/** Input Schema */
const ReplyToDiffCommentInput = z.object({
  taskId: z.string().describe('Plan ID'),
  sessionToken: z.string().describe('Session token from create_task'),
  commentId: z.string().describe('Comment ID (PR or local diff comment)'),
  body: z.string().describe('Reply text'),
});

/**
 * Parse comment ID to extract type and actual ID.
 * Supports: "[pr:abc123]", "pr:abc123", "[local:abc123]", "local:abc123", or bare "abc123"
 */
function parseCommentId(input: string): {
  type: 'pr' | 'local' | 'unknown';
  id: string;
} {
  let cleaned = input.trim();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }

  if (cleaned.startsWith('pr:')) {
    return { type: 'pr', id: cleaned.slice(3) };
  }
  if (cleaned.startsWith('local:')) {
    return { type: 'local', id: cleaned.slice(6) };
  }

  return { type: 'unknown', id: cleaned };
}

/**
 * Register the reply_to_diff_comment tool.
 */
export function registerReplyToDiffCommentTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Reply to a PR review comment or local diff comment.

Allows AI to respond to code review feedback.
Replies appear inline in the Changes tab with the original comment.

USAGE:
- commentId: Comment ID from readDiffComments output (format: [pr:abc123] or [local:abc123])
- body: Reply text (markdown supported)

The tool automatically detects whether the comment is a PR or local diff comment.

EXAMPLE:
reply_to_diff_comment({
  taskId: "abc123",
  sessionToken: "token",
  commentId: "pr:xyz789",
  body: "Good point! I'll add that validation in the next commit."
})`,
    {
      taskId: { type: 'string', description: 'Plan ID' },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
      commentId: { type: 'string', description: 'Comment ID (PR or local)' },
      body: { type: 'string', description: 'Reply text' },
    },
    async (args: unknown) => {
      const input = ReplyToDiffCommentInput.parse(args);

      logger.info({ taskId: input.taskId, commentId: input.commentId }, 'Replying to diff comment');

      /** Get task document */
      const taskResult = await getTaskDocument(input.taskId);
      if (!taskResult.success) {
        return errorResponse(taskResult.error);
      }
      const { doc, meta } = taskResult;

      /** Verify session token */
      const tokenError = verifySessionToken(
        input.sessionToken,
        meta.sessionTokenHash,
        input.taskId
      );
      if (tokenError) {
        return errorResponse(tokenError);
      }

      /** Get actor name */
      const actorName = await getGitHubUsername();

      /** Parse comment ID */
      const parsed = parseCommentId(input.commentId);

      logger.debug(
        {
          inputCommentId: input.commentId,
          parsedType: parsed.type,
          parsedId: parsed.id,
        },
        'Parsed comment ID from input'
      );

      const allComments: Record<
        string,
        {
          kind: string;
          id: string;
          threadId: string;
          path?: string;
          line?: number;
          prNumber?: number;
        }
      > = doc.comments.toJSON();
      let parentComment:
        | {
            kind: string;
            id: string;
            threadId: string;
            path?: string;
            line?: number;
            prNumber?: number;
          }
        | undefined;

      for (const comment of Object.values(allComments)) {
        if (comment.id === parsed.id) {
          if (
            parsed.type === 'unknown' ||
            (parsed.type === 'pr' && comment.kind === 'pr') ||
            (parsed.type === 'local' && comment.kind === 'local')
          ) {
            parentComment = comment;
            break;
          }
        }
      }

      if (!parentComment) {
        return errorResponse(
          `Comment "${parsed.id}" not found in task "${input.taskId}".${
            input.commentId !== parsed.id ? ` (parsed from input: "${input.commentId}")` : ''
          } Make sure the comment ID is correct and the comment exists.`
        );
      }

      const replyId = generateCommentId();
      const reply = {
        kind: parentComment.kind,
        id: replyId,
        threadId: parentComment.threadId,
        body: input.body,
        author: actorName,
        createdAt: Date.now(),
        resolved: false,
        inReplyTo: parsed.id,
        ...(parentComment.path && { path: parentComment.path }),
        ...(parentComment.line !== undefined && { line: parentComment.line }),
        ...(parentComment.prNumber !== undefined && {
          prNumber: parentComment.prNumber,
        }),
      };

      /** Add reply to comments */
      const commentsMap = doc.comments;
      commentsMap.set(replyId, reply);

      /** Log event */
      doc.logEvent('comment_added', actorName, {
        commentId: replyId,
        threadId: parentComment.threadId,
        preview: input.body.slice(0, 100),
      });

      logger.info(
        {
          taskId: input.taskId,
          commentId: replyId,
          parentCommentId: parsed.id,
        },
        `${parentComment.kind === 'pr' ? 'PR review' : 'Local diff'} comment reply added`
      );

      const locationInfo =
        parentComment.path && parentComment.line !== undefined
          ? `\nFile: ${parentComment.path}:${parentComment.line}`
          : '';

      return {
        content: [
          {
            type: 'text',
            text: `Reply added to ${parentComment.kind === 'pr' ? 'PR review' : 'local diff'} comment!

Comment ID: ${replyId}
Parent Comment ID: ${parsed.id}${locationInfo}

The reply will appear in the Changes tab inline with the original comment.`,
          },
        ],
      };
    }
  );
}
