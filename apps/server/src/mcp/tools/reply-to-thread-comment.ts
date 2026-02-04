/**
 * MCP Tool: reply_to_thread_comment
 *
 * Replies to a BlockNote inline thread comment.
 * Ported from apps/server-legacy/src/tools/reply-to-thread-comment.ts
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
const TOOL_NAME = 'reply_to_thread_comment';

/** Input Schema */
const ReplyToThreadCommentInput = z.object({
  taskId: z.string().describe('Plan ID'),
  sessionToken: z.string().describe('Session token from create_task'),
  threadId: z.string().describe('Thread ID to reply to'),
  body: z.string().describe('Reply text'),
});

/**
 * Parse thread ID to extract actual UUID from wrapped format.
 * Supports both bare IDs and wrapped format: "[thread:abc123]"
 */
function parseThreadId(input: string): string {
  let cleaned = input.trim();

  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }

  if (cleaned.startsWith('thread:')) {
    cleaned = cleaned.slice(7);
  }

  return cleaned;
}

/**
 * Register the reply_to_thread_comment tool.
 */
export function registerReplyToThreadCommentTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Reply to a BlockNote inline thread comment.

Allows AI to respond to reviewer feedback on specific blocks.
Replies appear in the comment thread sidebar.

USAGE:
- threadId: Thread ID from read_plan output (format: [thread:abc123])
- body: Reply text (plain text or BlockNote structured content)

EXAMPLE:
reply_to_thread_comment({
  taskId: "abc123",
  sessionToken: "token",
  threadId: "thread-xyz",
  body: "Good point! I'll add that validation."
})`,
    {
      taskId: { type: 'string', description: 'Plan ID' },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
      threadId: { type: 'string', description: 'Thread ID to reply to' },
      body: { type: 'string', description: 'Reply text' },
    },
    async (args: unknown) => {
      const input = ReplyToThreadCommentInput.parse(args);

      logger.info({ taskId: input.taskId, threadId: input.threadId }, 'Replying to thread comment');

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

      /** Parse thread ID */
      const parsedThreadId = parseThreadId(input.threadId);

      logger.debug(
        { inputThreadId: input.threadId, parsedThreadId },
        'Parsed thread ID from input'
      );

      const allComments: Record<
        string,
        {
          kind: string;
          id: string;
          threadId: string;
          blockId?: string;
        }
      > = doc.comments.toJSON();

      let foundThread = false;
      let blockId: string | undefined;

      for (const comment of Object.values(allComments)) {
        if (comment.threadId === parsedThreadId && comment.kind === 'inline') {
          foundThread = true;
          blockId = comment.blockId;
          break;
        }
      }

      if (!foundThread) {
        return errorResponse(
          `Thread "${parsedThreadId}" not found in task "${input.taskId}".${
            input.threadId !== parsedThreadId ? ` (parsed from input: "${input.threadId}")` : ''
          }`
        );
      }

      /** Create reply comment */
      const replyId = generateCommentId();
      const reply = {
        kind: 'inline' as const,
        id: replyId,
        threadId: parsedThreadId,
        body: input.body,
        author: actorName,
        createdAt: Date.now(),
        resolved: false,
        inReplyTo: null,
        blockId: blockId || '',
        selectedText: null,
      };

      /** Add reply to comments */
      const commentsMap = doc.comments;
      commentsMap.set(replyId, reply);

      /** Log event */
      doc.logEvent('comment_added', actorName, {
        commentId: replyId,
        threadId: parsedThreadId,
        preview: input.body.slice(0, 100),
      });

      logger.info(
        { taskId: input.taskId, threadId: parsedThreadId, commentId: replyId },
        'Thread reply added'
      );

      return {
        content: [
          {
            type: 'text',
            text: `Reply added to thread!

Comment ID: ${replyId}
Thread ID: ${parsedThreadId}

The reply will appear in the comments panel when viewing this task.`,
          },
        ],
      };
    }
  );
}
