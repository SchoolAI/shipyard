/**
 * MCP Tool: read_diff_comments
 *
 * Reads PR review comments from GitHub and local diff comments.
 * Ported from apps/server-legacy/src/tools/read-diff-comments.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from 'zod';
import type { McpServer } from '../index.js';
import { errorResponse, getTaskDocument, verifySessionToken } from './helpers.js';

/** Tool name constant */
const TOOL_NAME = 'read_diff_comments';

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
 * Format diff comments for LLM output.
 */
function formatDiffCommentsForLLM(
  comments: Array<{
    kind: string;
    id: string;
    body: string;
    author: string;
    path: string;
    line: number;
    resolved: boolean;
  }>,
  includeResolved: boolean
): string {
  const filtered = includeResolved ? comments : comments.filter((c) => !c.resolved);

  if (filtered.length === 0) {
    return 'No diff comments found.';
  }

  const prComments = filtered.filter((c) => c.kind === 'pr');
  const localComments = filtered.filter((c) => c.kind === 'local');

  let output = '';

  if (prComments.length > 0) {
    output += '## PR Review Comments\n\n';
    const byFile = new Map<string, typeof prComments>();
    for (const c of prComments) {
      const existing = byFile.get(c.path) || [];
      existing.push(c);
      byFile.set(c.path, existing);
    }

    for (const [path, fileComments] of byFile) {
      output += `### ${path}\n\n`;
      for (const c of fileComments.sort((a, b) => a.line - b.line)) {
        output += `- Line ${c.line} [pr:${c.id}]: @${c.author}\n`;
        output += `  ${c.body}\n`;
        if (c.resolved) {
          output += '  (resolved)\n';
        }
        output += '\n';
      }
    }
  }

  if (localComments.length > 0) {
    output += '## Local Diff Comments\n\n';
    const byFile = new Map<string, typeof localComments>();
    for (const c of localComments) {
      const existing = byFile.get(c.path) || [];
      existing.push(c);
      byFile.set(c.path, existing);
    }

    for (const [path, fileComments] of byFile) {
      output += `### ${path}\n\n`;
      for (const c of fileComments.sort((a, b) => a.line - b.line)) {
        output += `- Line ${c.line} [local:${c.id}]: @${c.author}\n`;
        output += `  ${c.body}\n`;
        if (c.resolved) {
          output += '  (resolved)\n';
        }
        output += '\n';
      }
    }
  }

  return output;
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

      const allComments: Record<
        string,
        {
          kind: string;
          id: string;
          body: string;
          author: string;
          path?: string;
          line?: number;
          resolved: boolean;
        }
      > = doc.comments.toJSON();
      const diffComments: Array<{
        kind: string;
        id: string;
        body: string;
        author: string;
        path: string;
        line: number;
        resolved: boolean;
      }> = [];

      for (const comment of Object.values(allComments)) {
        if ((comment.kind === 'pr' && includePR) || (comment.kind === 'local' && includeLocal)) {
          if (comment.path && comment.line !== undefined) {
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
        }
      }

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
