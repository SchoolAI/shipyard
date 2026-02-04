/**
 * MCP Tool: read_diff_comments
 *
 * Reads PR review comments from GitHub and local diff comments.
 * Ported from apps/server-legacy/src/tools/read-diff-comments.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from 'zod';
import { errorResponse, getTaskDocument, verifySessionToken } from '../helpers.js';
import type { McpServer } from '../index.js';

/** Tool name constant */
const TOOL_NAME = 'read_diff_comments';

/** Comment type for diff comments */
interface DiffComment {
  kind: string;
  id: string;
  body: string;
  author: string;
  path: string;
  line: number;
  resolved: boolean;
}

/** Input Schema */
const ReadDiffCommentsInput = z.object({
  taskId: z.string().describe('The task ID to read diff comments from'),
  sessionToken: z.string().describe('Session token from create_task'),
  includeLocal: z
    .boolean()
    .optional()
    .describe('Include local (uncommitted) diff comments (default: true)'),
  includePR: z.boolean().optional().describe('Include PR review diff comments (default: true)'),
  includeResolved: z.boolean().optional().describe('Include resolved comments (default: false)'),
});

/**
 * Group comments by file path.
 */
function groupByFilePath(comments: DiffComment[]): Map<string, DiffComment[]> {
  const byFile = new Map<string, DiffComment[]>();
  for (const comment of comments) {
    const existing = byFile.get(comment.path) ?? [];
    existing.push(comment);
    byFile.set(comment.path, existing);
  }
  return byFile;
}

/**
 * Format a single comment for output.
 */
function formatComment(comment: DiffComment, kindPrefix: string): string {
  const resolvedMarker = comment.resolved ? '  (resolved)\n' : '';
  return `- Line ${comment.line} [${kindPrefix}:${comment.id}]: @${comment.author}\n  ${comment.body}\n${resolvedMarker}\n`;
}

/**
 * Format a section of comments (PR or local).
 */
function formatCommentSection(
  comments: DiffComment[],
  sectionTitle: string,
  kindPrefix: string
): string {
  if (comments.length === 0) {
    return '';
  }

  let output = `## ${sectionTitle}\n\n`;
  const byFile = groupByFilePath(comments);

  for (const [path, fileComments] of byFile) {
    output += `### ${path}\n\n`;
    const sortedComments = fileComments.sort((a, b) => a.line - b.line);
    for (const comment of sortedComments) {
      output += formatComment(comment, kindPrefix);
    }
  }

  return output;
}

/**
 * Format diff comments for LLM output.
 */
function formatDiffCommentsForLLM(comments: DiffComment[], includeResolved: boolean): string {
  const filtered = includeResolved ? comments : comments.filter((c) => !c.resolved);

  if (filtered.length === 0) {
    return 'No diff comments found.';
  }

  const prComments = filtered.filter((c) => c.kind === 'pr');
  const localComments = filtered.filter((c) => c.kind === 'local');

  const prSection = formatCommentSection(prComments, 'PR Review Comments', 'pr');
  const localSection = formatCommentSection(localComments, 'Local Diff Comments', 'local');

  return prSection + localSection;
}

/** Raw comment type from document */
interface RawComment {
  kind: string;
  id: string;
  body: string;
  author: string;
  path?: string;
  line?: number;
  resolved: boolean;
}

/**
 * Check if a comment should be included based on filters.
 */
function shouldIncludeComment(
  comment: RawComment,
  includeLocal: boolean,
  includePR: boolean
): boolean {
  const isPRComment = comment.kind === 'pr' && includePR;
  const isLocalComment = comment.kind === 'local' && includeLocal;
  return isPRComment || isLocalComment;
}

/**
 * Check if a comment has valid diff location (path and line).
 */
function hasValidDiffLocation(comment: RawComment): comment is RawComment & {
  path: string;
  line: number;
} {
  return comment.path !== undefined && comment.line !== undefined;
}

/**
 * Extract diff comments from raw comments based on filters.
 */
function extractDiffComments(
  allComments: Record<string, RawComment>,
  includeLocal: boolean,
  includePR: boolean
): DiffComment[] {
  const diffComments: DiffComment[] = [];

  for (const comment of Object.values(allComments)) {
    if (!shouldIncludeComment(comment, includeLocal, includePR)) {
      continue;
    }
    if (!hasValidDiffLocation(comment)) {
      continue;
    }

    diffComments.push({
      kind: comment.kind,
      id: comment.id,
      body: comment.body,
      author: comment.author,
      path: comment.path,
      line: comment.line,
      resolved: comment.resolved,
    });
  }

  return diffComments;
}

/**
 * Register the read_diff_comments tool.
 */
export function registerReadDiffCommentsTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Read inline diff comments on local changes and PR diffs.

USE CASES:
- Read human feedback on uncommitted local changes
- Read PR review comments on specific lines
- Check if diff feedback has been addressed (resolved status)
- Get context on what changes need attention

COMMENT TYPES:
- Local: Comments on uncommitted changes (git diff HEAD)
- PR: Comments on PR diffs from GitHub reviews

OUTPUT FORMAT:
- Grouped by comment type (Local vs PR)
- Within each type, grouped by file path
- Sorted by line number within files
- Shows author, line number, comment body, and resolved status`,
    {
      taskId: {
        type: 'string',
        description: 'The task ID to read diff comments from',
      },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
      includeLocal: {
        type: 'boolean',
        description: 'Include local (uncommitted) diff comments (default: true)',
      },
      includePR: {
        type: 'boolean',
        description: 'Include PR review diff comments (default: true)',
      },
      includeResolved: {
        type: 'boolean',
        description: 'Include resolved comments (default: false)',
      },
    },
    async (args: unknown) => {
      const {
        taskId,
        sessionToken,
        includeLocal = true,
        includePR = true,
        includeResolved = false,
      } = ReadDiffCommentsInput.parse(args);

      /** Get task document */
      const taskResult = await getTaskDocument(taskId);
      if (!taskResult.success) {
        return errorResponse(taskResult.error);
      }
      const { doc, meta } = taskResult;

      /** Verify session token */
      const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
      if (tokenError) {
        return errorResponse(tokenError);
      }

      const allComments: Record<string, RawComment> = doc.comments.toJSON();
      const diffComments = extractDiffComments(allComments, includeLocal, includePR);

      /** Format for output */
      const formatted = formatDiffCommentsForLLM(diffComments, includeResolved);

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    }
  );
}
