/**
 * MCP Tool: reply_to_diff_comment
 *
 * Replies to a specific PR diff comment or local diff comment.
 * Ported from apps/server-legacy/src/tools/reply-to-diff-comment.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { generateCommentId, type TaskDocument } from '@shipyard/loro-schema';
import { z } from 'zod';
import { getGitHubUsername } from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import { errorResponse, getTaskDocument, verifySessionToken } from '../helpers.js';
import type { McpServer } from '../index.js';

/** Tool name constant */
const TOOL_NAME = 'reply_to_diff_comment';

/** Input Schema */
const ReplyToDiffCommentInput = z.object({
  taskId: z.string().describe('Plan ID'),
  sessionToken: z.string().describe('Session token from create_task'),
  commentId: z.string().describe('Comment ID (PR or local diff comment)'),
  body: z.string().describe('Reply text'),
});

/** Comment type from the document */
interface DiffComment {
  kind: string;
  id: string;
  threadId: string;
  path?: string;
  line?: number;
  prNumber?: number;
}

/** Parsed comment ID result */
interface ParsedCommentId {
  type: 'pr' | 'local' | 'unknown';
  id: string;
}

/**
 * Parse comment ID to extract type and actual ID.
 * Supports: "[pr:abc123]", "pr:abc123", "[local:abc123]", "local:abc123", or bare "abc123"
 */
function parseCommentId(input: string): ParsedCommentId {
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
 * Check if a comment matches the parsed type.
 */
function commentMatchesParsedType(
  comment: DiffComment,
  parsedType: ParsedCommentId['type']
): boolean {
  if (parsedType === 'unknown') return true;
  if (parsedType === 'pr' && comment.kind === 'pr') return true;
  if (parsedType === 'local' && comment.kind === 'local') return true;
  return false;
}

/**
 * Find a parent comment by ID and type from all comments.
 */
function findParentComment(
  allComments: Record<string, DiffComment>,
  parsed: ParsedCommentId
): DiffComment | undefined {
  for (const comment of Object.values(allComments)) {
    if (comment.id === parsed.id && commentMatchesParsedType(comment, parsed.type)) {
      return comment;
    }
  }
  return undefined;
}

/**
 * Build the reply object with inherited properties from the parent comment.
 */
function buildReply(
  parentComment: DiffComment,
  parsedId: string,
  body: string,
  actorName: string
): Record<string, unknown> {
  const replyId = generateCommentId();
  const baseReply = {
    kind: parentComment.kind,
    id: replyId,
    threadId: parentComment.threadId,
    body,
    author: actorName,
    createdAt: Date.now(),
    resolved: false,
    inReplyTo: parsedId,
  };

  const optionalFields: Record<string, unknown> = {};
  if (parentComment.path) {
    optionalFields.path = parentComment.path;
  }
  if (parentComment.line !== undefined) {
    optionalFields.line = parentComment.line;
  }
  if (parentComment.prNumber !== undefined) {
    optionalFields.prNumber = parentComment.prNumber;
  }

  return { ...baseReply, ...optionalFields, _replyId: replyId };
}

/**
 * Save the reply to the document and log the event.
 */
function saveReplyToDocument(
  doc: TaskDocument,
  reply: Record<string, unknown>,
  actorName: string,
  body: string
): string {
  const replyId = reply._replyId as string;
  const { _replyId, ...replyData } = reply;

  doc.comments.set(replyId, replyData);

  doc.logEvent('comment_added', actorName, {
    commentId: replyId,
    threadId: reply.threadId as string,
    preview: body.slice(0, 100),
  });

  return replyId;
}

/**
 * Format the location info string for the response.
 */
function formatLocationInfo(parentComment: DiffComment): string {
  if (parentComment.path && parentComment.line !== undefined) {
    return `\nFile: ${parentComment.path}:${parentComment.line}`;
  }
  return '';
}

/**
 * Build the error message for a missing comment.
 */
function buildCommentNotFoundError(
  parsedId: string,
  inputCommentId: string,
  taskId: string
): string {
  const parsedNote = inputCommentId !== parsedId ? ` (parsed from input: "${inputCommentId}")` : '';
  return `Comment "${parsedId}" not found in task "${taskId}".${parsedNote} Make sure the comment ID is correct and the comment exists.`;
}

/**
 * Get the comment type label for display.
 */
function getCommentTypeLabel(kind: string): string {
  return kind === 'pr' ? 'PR review' : 'local diff';
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

      const taskResult = await getTaskDocument(input.taskId);
      if (!taskResult.success) {
        return errorResponse(taskResult.error);
      }
      const { doc, meta } = taskResult;

      const tokenError = verifySessionToken(
        input.sessionToken,
        meta.sessionTokenHash,
        input.taskId
      );
      if (tokenError) {
        return errorResponse(tokenError);
      }

      const actorName = await getGitHubUsername();
      const parsed = parseCommentId(input.commentId);

      logger.debug(
        { inputCommentId: input.commentId, parsedType: parsed.type, parsedId: parsed.id },
        'Parsed comment ID from input'
      );

      const allComments = doc.comments.toJSON() as Record<string, DiffComment>;
      const parentComment = findParentComment(allComments, parsed);

      if (!parentComment) {
        return errorResponse(buildCommentNotFoundError(parsed.id, input.commentId, input.taskId));
      }

      const reply = buildReply(parentComment, parsed.id, input.body, actorName);
      const replyId = saveReplyToDocument(doc, reply, actorName, input.body);

      logger.info(
        { taskId: input.taskId, commentId: replyId, parentCommentId: parsed.id },
        `${getCommentTypeLabel(parentComment.kind)} comment reply added`
      );

      const locationInfo = formatLocationInfo(parentComment);
      const typeLabel = getCommentTypeLabel(parentComment.kind);

      return {
        content: [
          {
            type: 'text',
            text: `Reply added to ${typeLabel} comment!\n\nComment ID: ${replyId}\nParent Comment ID: ${parsed.id}${locationInfo}\n\nThe reply will appear in the Changes tab inline with the original comment.`,
          },
        ],
      };
    }
  );
}
