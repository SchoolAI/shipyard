import {
  getPlanMetadata,
  logPlanEvent,
  parseThreadId,
  ThreadCommentSchema,
  toPlainObject,
  YDOC_KEYS,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { getClientInfo } from '../mcp-client-info.js';
import { detectPlatform, getDisplayName } from '../platform-detection.js';
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

    /** Get actor name for event logging and platform detection for comment identity */
    const actorName = await getGitHubUsername();
    const clientInfoName = getClientInfo();
    const { platform } = detectPlatform(clientInfoName);
    const agentDisplayName = getDisplayName(platform, actorName);

    /**
     * Parse thread ID to extract actual UUID from wrapped format.
     * Supports both bare IDs and wrapped format from export: "[thread:abc123]"
     */
    const parsedThreadId = parseThreadId(input.threadId);

    logger.debug({ inputThreadId: input.threadId, parsedThreadId }, 'Parsed thread ID from input');

    /**
     * Create and validate reply comment before transaction.
     * Validation ensures comment structure is correct before CRDT write.
     */
    const reply = ThreadCommentSchema.parse({
      id: nanoid(),
      userId: agentDisplayName,
      body: input.body,
      createdAt: Date.now(),
    });

    /**
     * Atomically add reply to thread and log event.
     * Thread existence check happens inside transaction to prevent TOCTOU race.
     */
    let updateSucceeded = false;

    ydoc.transact(
      () => {
        const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
        const threadDataRaw = threadsMap.get(parsedThreadId);

        if (!threadDataRaw || typeof threadDataRaw !== 'object') {
          return;
        }

        /**
         * Handle both Y.Map and plain object.
         * toPlainObject safely converts Y.Map (which has toJSON) to plain object.
         * CRITICAL: Without this conversion, spreading a Y.Map copies internal
         * circular references, causing "Maximum call stack size exceeded" errors
         * when Yjs tries to encode the data.
         */
        const threadData = toPlainObject(threadDataRaw);
        if (!threadData) {
          return;
        }

        if (!('comments' in threadData)) {
          return;
        }

        const existingComments = Array.isArray(threadData.comments) ? threadData.comments : [];
        const updatedThread = {
          ...threadData,
          comments: [...existingComments, reply],
        };
        threadsMap.set(parsedThreadId, updatedThread);

        /** Log event in same transaction for atomicity */
        logPlanEvent(ydoc, 'comment_added', actorName, {
          commentId: reply.id,
        });

        updateSucceeded = true;
      },
      actorName ? { actor: actorName } : undefined
    );

    /** Return error if thread was not found or update failed */
    if (!updateSucceeded) {
      return {
        content: [
          {
            type: 'text',
            text: `Thread "${parsedThreadId}" not found in plan "${input.taskId}".${
              input.threadId !== parsedThreadId ? ` (parsed from input: "${input.threadId}")` : ''
            }`,
          },
        ],
        isError: true,
      };
    }

    logger.info(
      { taskId: input.taskId, threadId: parsedThreadId, commentId: reply.id },
      'Thread reply added'
    );

    return {
      content: [
        {
          type: 'text',
          text: `Reply added to thread!

Comment ID: ${reply.id}
Thread ID: ${parsedThreadId}

The reply will appear in the comments panel when viewing this plan.`,
        },
      ],
    };
  },
};
