import {
  getPlanMetadata,
  getThread,
  logPlanEvent,
  type ThreadComment,
  YDOC_KEYS,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

/** --- Input Schema --- */

const ReplyToThreadCommentInput = z.object({
  taskId: z.string().describe('Plan ID'),
  sessionToken: z.string().describe('Session token from create_plan'),
  threadId: z.string().describe('Thread ID to reply to'),
  body: z.string().describe('Reply text'),
});

/** --- Public Export --- */

export const replyToThreadCommentTool = {
  definition: {
    name: TOOL_NAMES.REPLY_TO_THREAD_COMMENT,
    description: `Reply to a BlockNote inline thread comment.

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
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Plan ID' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        threadId: { type: 'string', description: 'Thread ID to reply to' },
        body: { type: 'string', description: 'Reply text' },
      },
      required: ['taskId', 'sessionToken', 'threadId', 'body'],
    },
  },

  handler: async (args: unknown) => {
    const input = ReplyToThreadCommentInput.parse(args);

    logger.info({ taskId: input.taskId, threadId: input.threadId }, 'Replying to thread comment');

    const ydoc = await getOrCreateDoc(input.taskId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: `Plan "${input.taskId}" not found.` }],
        isError: true,
      };
    }

    /** Verify session token */
    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [{ type: 'text', text: `Invalid session token for plan "${input.taskId}".` }],
        isError: true,
      };
    }

    /** Get the thread */
    const thread = getThread(ydoc, input.threadId);
    if (!thread) {
      return {
        content: [
          { type: 'text', text: `Thread "${input.threadId}" not found in plan "${input.taskId}".` },
        ],
        isError: true,
      };
    }

    /** Get actor name for event logging */
    const actorName = await getGitHubUsername();

    /** Create reply comment */
    const reply: ThreadComment = {
      id: nanoid(),
      userId: 'AI', // TODO: Replace with proper identity after identity PR merges
      body: input.body,
      createdAt: Date.now(),
    };

    /** Add reply to thread's comments array */
    ydoc.transact(
      () => {
        const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
        const threadData = threadsMap.get(input.threadId);

        if (threadData && typeof threadData === 'object' && 'comments' in threadData) {
          const existingComments = Array.isArray(threadData.comments) ? threadData.comments : [];
          const updatedThread = {
            ...threadData,
            comments: [...existingComments, reply],
          };
          threadsMap.set(input.threadId, updatedThread);
        }
      },
      actorName ? { actor: actorName } : undefined
    );

    /** Log comment added event */
    logPlanEvent(ydoc, 'comment_added', actorName, {
      commentId: reply.id,
    });

    logger.info(
      { taskId: input.taskId, threadId: input.threadId, commentId: reply.id },
      'Thread reply added'
    );

    return {
      content: [
        {
          type: 'text',
          text: `Reply added to thread!

Comment ID: ${reply.id}
Thread ID: ${input.threadId}

The reply will appear in the comments panel when viewing this plan.`,
        },
      ],
    };
  },
};
