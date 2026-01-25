/**
 * Shared PR review comment formatting utilities for LLM-friendly output.
 * Used by MCP server (read_plan) to provide inline diff comments to agents.
 */

import type { PRReviewComment } from './plan.js';

export interface FormatPRCommentsOptions {
  /** Include resolved comments (default: false) */
  includeResolved?: boolean;
}

/**
 * Format PR review comments for LLM consumption.
 * Groups comments by file and line number for readability.
 *
 * Example output:
 * ```
 * ## PR Review Comments
 *
 * ### src/utils/auth.ts
 * - Line 25 (jacob): Consider adding validation here
 * - Line 42 (AI) [RESOLVED]: This could throw if null
 *
 * ### src/components/Login.tsx
 * - Line 10 (jacob): Should use useCallback
 * ```
 */
export function formatPRCommentsForLLM(
  comments: PRReviewComment[],
  options: FormatPRCommentsOptions = {}
): string {
  const { includeResolved = false } = options;

  const unresolvedComments = comments.filter((c) => !c.resolved);
  const resolvedCount = comments.length - unresolvedComments.length;
  const commentsToShow = includeResolved ? comments : unresolvedComments;

  if (commentsToShow.length === 0) {
    if (resolvedCount > 0) {
      return `All ${resolvedCount} PR review comment(s) have been resolved.`;
    }
    return '';
  }

  const commentsByFile = new Map<string, PRReviewComment[]>();
  for (const comment of commentsToShow) {
    const existing = commentsByFile.get(comment.path);
    if (existing) {
      existing.push(comment);
    } else {
      commentsByFile.set(comment.path, [comment]);
    }
  }

  const sortedFiles = Array.from(commentsByFile.entries()).sort(([a], [b]) => a.localeCompare(b));

  const sections = sortedFiles.map(([path, fileComments]) => {
    const sorted = fileComments.sort((a, b) => a.line - b.line);

    const lines = sorted.map((comment) => {
      const resolvedMarker = comment.resolved ? ' [RESOLVED]' : '';
      const body = comment.body.replace(/\n/g, ' ').trim();
      return `- Line ${comment.line} (${comment.author})${resolvedMarker}: ${body}`;
    });

    return `### ${path}\n${lines.join('\n')}`;
  });

  let output = `## PR Review Comments\n\n${sections.join('\n\n')}`;

  if (!includeResolved && resolvedCount > 0) {
    output += `\n\n---\n(${resolvedCount} resolved comment(s) not shown)`;
  }

  return output;
}

/**
 * Get summary stats for PR review comments.
 */
export function getPRCommentsSummary(comments: PRReviewComment[]): {
  total: number;
  unresolved: number;
  resolved: number;
  byFile: Map<string, number>;
} {
  const byFile = new Map<string, number>();
  let unresolved = 0;
  let resolved = 0;

  for (const comment of comments) {
    if (comment.resolved) {
      resolved++;
    } else {
      unresolved++;
    }

    const count = byFile.get(comment.path) ?? 0;
    byFile.set(comment.path, count + 1);
  }

  return {
    total: comments.length,
    unresolved,
    resolved,
    byFile,
  };
}
