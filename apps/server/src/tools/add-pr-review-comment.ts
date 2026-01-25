import {
  addPRReviewComment,
  getPlanMetadata,
  logPlanEvent,
  type PRReviewComment,
} from '@shipyard/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

/** --- Input Schema --- */

const AddPRReviewCommentInput = z.object({
  planId: z.string().describe('Plan ID'),
  sessionToken: z.string().describe('Session token from create_plan'),
  prNumber: z.number().describe('PR number to comment on'),
  path: z.string().describe('File path in the diff'),
  line: z.number().describe('Line number in the modified file'),
  body: z.string().describe('Comment content (markdown supported)'),
});

/** --- Public Export --- */

export const addPRReviewCommentTool = {
  definition: {
    name: TOOL_NAMES.ADD_PR_REVIEW_COMMENT,
    description: `Add a review comment to a PR diff.

Allows AI to provide feedback on code changes in linked PRs.
Comments appear inline in the Changes tab.

USAGE:
- Requires a linked PR (check via read_plan with includeLinkedPRs)
- path: File path (e.g., "src/components/Button.tsx")
- line: Line number in the MODIFIED file (not diff line)
- body: Comment content (supports markdown)

EXAMPLE:
add_pr_review_comment({
  planId: "abc123",
  sessionToken: "token",
  prNumber: 42,
  path: "src/utils/validator.ts",
  line: 25,
  body: "Consider adding input validation here to prevent XSS."
})`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        prNumber: { type: 'number', description: 'PR number to comment on' },
        path: { type: 'string', description: 'File path in the diff' },
        line: { type: 'number', description: 'Line number in modified file' },
        body: { type: 'string', description: 'Comment content (markdown supported)' },
      },
      required: ['planId', 'sessionToken', 'prNumber', 'path', 'line', 'body'],
    },
  },

  handler: async (args: unknown) => {
    const input = AddPRReviewCommentInput.parse(args);

    logger.info(
      { planId: input.planId, prNumber: input.prNumber, path: input.path, line: input.line },
      'Adding PR review comment'
    );

    const ydoc = await getOrCreateDoc(input.planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      return {
        content: [{ type: 'text', text: `Plan "${input.planId}" not found.` }],
        isError: true,
      };
    }

    /** Verify session token */
    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(input.sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [{ type: 'text', text: `Invalid session token for plan "${input.planId}".` }],
        isError: true,
      };
    }

    /** Get actor name for event logging */
    const actorName = await getGitHubUsername();

    const comment: PRReviewComment = {
      id: nanoid(),
      prNumber: input.prNumber,
      path: input.path,
      line: input.line,
      body: input.body,
      author: 'AI',
      createdAt: Date.now(),
      resolved: false,
    };

    addPRReviewComment(ydoc, comment, actorName);

    /** Log comment added event (semantic action) */
    logPlanEvent(ydoc, 'comment_added', actorName, {
      commentId: comment.id,
      prNumber: input.prNumber,
    });

    logger.info(
      { planId: input.planId, commentId: comment.id, prNumber: input.prNumber },
      'PR review comment added'
    );

    return {
      content: [
        {
          type: 'text',
          text: `Review comment added!

Comment ID: ${comment.id}
PR: #${input.prNumber}
File: ${input.path}:${input.line}

The comment will appear in the Changes tab when viewing this PR.`,
        },
      ],
    };
  },
};
