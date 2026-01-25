/**
 * Shared diff comment formatting utilities for LLM-friendly output.
 * Used by MCP server tools to provide inline diff comments to agents.
 * Handles both PR review comments and local diff comments.
 */

import type { DiffComment, LocalDiffComment, PRReviewComment } from './plan.js';
import {
  buildLineContentMap,
  computeCommentStaleness,
  formatStalenessMarker,
  type StalenessInfo,
} from './staleness-detection.js';

export interface FormatDiffCommentsOptions {
  /** Include resolved comments (default: false) */
  includeResolved?: boolean;
  /** Current HEAD SHA for staleness detection (local comments only) */
  currentHeadSha?: string;
  /** Map of "path:line" to current line content for staleness detection */
  lineContentMap?: Map<string, string>;
  /** Array of file changes with patches - alternative to lineContentMap */
  files?: Array<{ path: string; patch?: string }>;
}

/** Backwards compatibility alias */
export type FormatPRCommentsOptions = FormatDiffCommentsOptions;

/** Common fields needed for formatting a comment line */
interface FormattableComment {
  line: number;
  author: string;
  resolved?: boolean;
  body: string;
}

/** Extended comment with staleness info for formatting */
interface FormattableCommentWithStaleness extends FormattableComment {
  staleness?: StalenessInfo;
}

/**
 * Group items by a key extractor function.
 * Returns entries sorted by key.
 */
function groupBy<T, K extends string | number>(
  items: T[],
  getKey: (item: T) => K,
  sortKeys: (a: K, b: K) => number
): [K, T[]][] {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => sortKeys(a, b));
}

/**
 * Format a single comment as a markdown list item.
 * Includes resolved and staleness markers when applicable.
 */
function formatCommentLine(comment: FormattableCommentWithStaleness): string {
  const markers: string[] = [];

  if (comment.resolved) {
    markers.push('[RESOLVED]');
  }

  if (comment.staleness) {
    const stalenessMarker = formatStalenessMarker(comment.staleness);
    if (stalenessMarker) {
      markers.push(stalenessMarker);
    }
  }

  const markerStr = markers.length > 0 ? ` ${markers.join(' ')}` : '';
  const body = comment.body.replace(/\n/g, ' ').trim();
  return `- Line ${comment.line} (${comment.author})${markerStr}: ${body}`;
}

/** Local comment augmented with staleness for formatting */
interface LocalCommentWithStaleness extends LocalDiffComment {
  staleness?: StalenessInfo;
}

/**
 * Format a group of comments for a single file.
 * Sorts by line number and formats each as a list item.
 */
function formatFileSection<T extends FormattableCommentWithStaleness & { path: string }>(
  path: string,
  comments: T[]
): string {
  const sorted = [...comments].sort((a, b) => a.line - b.line);
  const lines = sorted.map(formatCommentLine);
  return `### ${path}\n${lines.join('\n')}`;
}

/**
 * Format local diff comments into a markdown section.
 * Includes staleness markers if staleness info is provided.
 */
function formatLocalCommentsSection(comments: LocalCommentWithStaleness[]): string {
  const byFile = groupBy(
    comments,
    (c) => c.path,
    (a, b) => a.localeCompare(b)
  );
  const fileSections = byFile.map(([path, fileComments]) => formatFileSection(path, fileComments));
  return `## Local Changes Comments\n\n${fileSections.join('\n\n')}`;
}

/**
 * Format PR review comments into markdown sections (one per PR).
 */
function formatPRCommentsSections(comments: PRReviewComment[]): string[] {
  const byPR = groupBy(
    comments,
    (c) => c.prNumber,
    (a, b) => a - b
  );

  return byPR.map(([prNumber, prComments]) => {
    const byFile = groupBy(
      prComments,
      (c) => c.path,
      (a, b) => a.localeCompare(b)
    );
    const fileSections = byFile.map(([path, fileComments]) =>
      formatFileSection(path, fileComments)
    );
    return `## PR Review Comments (PR #${prNumber})\n\n${fileSections.join('\n\n')}`;
  });
}

/**
 * Separate comments into local and PR types.
 */
function separateCommentTypes(comments: DiffComment[]): {
  local: LocalDiffComment[];
  pr: PRReviewComment[];
} {
  const local = comments.filter((c): c is LocalDiffComment => 'type' in c && c.type === 'local');
  const pr = comments.filter((c): c is PRReviewComment => !('type' in c));
  return { local, pr };
}

/**
 * Format diff comments (both PR and local) for LLM consumption.
 * Groups comments by file and line number for readability.
 * Includes staleness markers for local comments when staleness info is available.
 *
 * Example output:
 * ```
 * ## Local Changes Comments
 *
 * ### src/utils/auth.ts
 * - Line 25 (jacob): Consider adding validation here
 * - Line 42 (AI) [RESOLVED]: This could throw if null
 * - Line 55 (jacob) [STALE: HEAD changed]: Check this after commit
 *
 * ## PR Review Comments (PR #123)
 *
 * ### src/components/Login.tsx
 * - Line 10 (jacob): Should use useCallback
 * ```
 */
export function formatDiffCommentsForLLM(
  comments: DiffComment[],
  options: FormatDiffCommentsOptions = {}
): string {
  const { includeResolved = false, currentHeadSha, files } = options;

  const lineContentMap = options.lineContentMap ?? (files ? buildLineContentMap(files) : undefined);

  const unresolvedComments = comments.filter((c) => !c.resolved);
  const resolvedCount = comments.length - unresolvedComments.length;
  const commentsToShow = includeResolved ? comments : unresolvedComments;

  if (commentsToShow.length === 0) {
    return resolvedCount > 0 ? `All ${resolvedCount} diff comment(s) have been resolved.` : '';
  }

  const { local, pr } = separateCommentTypes(commentsToShow);
  const sections: string[] = [];

  if (local.length > 0) {
    const localWithStaleness: LocalCommentWithStaleness[] = local.map((comment) => {
      const key = `${comment.path}:${comment.line}`;
      const currentLineContent = lineContentMap?.get(key);
      const staleness = computeCommentStaleness(comment, currentHeadSha, currentLineContent);
      return { ...comment, staleness };
    });
    sections.push(formatLocalCommentsSection(localWithStaleness));
  }

  if (pr.length > 0) {
    sections.push(...formatPRCommentsSections(pr));
  }

  let output = sections.join('\n\n');

  if (!includeResolved && resolvedCount > 0) {
    output += `\n\n---\n(${resolvedCount} resolved comment(s) not shown)`;
  }

  return output;
}

/**
 * Format PR review comments for LLM consumption.
 * Backwards compatibility wrapper for formatDiffCommentsForLLM.
 */
export function formatPRCommentsForLLM(
  comments: PRReviewComment[],
  options: FormatPRCommentsOptions = {}
): string {
  return formatDiffCommentsForLLM(comments, options);
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
