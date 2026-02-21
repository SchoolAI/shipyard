import type { DiffComment } from '@shipyard/loro-schema';

/**
 * Format diff comments into structured feedback for Claude Code.
 *
 * Produces a markdown document combining:
 * 1. General feedback (if any)
 * 2. Inline comments grouped by file and sorted by line number
 */
export function formatDiffFeedbackForClaudeCode(
  comments: DiffComment[],
  generalFeedback: string | null
): string {
  const sections: string[] = [];

  if (generalFeedback) {
    sections.push('## General Feedback\n');
    sections.push(generalFeedback);
    sections.push('');
  }

  if (comments.length > 0) {
    appendCommentSection(sections, comments);
  }

  return sections.join('\n').trim();
}

function appendCommentSection(sections: string[], comments: DiffComment[]): void {
  sections.push('## Inline Comments on Code Changes\n');
  sections.push('The user left the following comments on the diff:\n');

  const byFile = new Map<string, DiffComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath) ?? [];
    existing.push(c);
    byFile.set(c.filePath, existing);
  }

  for (const [filePath, fileComments] of byFile) {
    sections.push(`### ${filePath}\n`);
    const sorted = [...fileComments].sort((a, b) => a.lineNumber - b.lineNumber);
    for (const comment of sorted) {
      const sideLabel = comment.side === 'old' ? 'before change' : 'after change';
      sections.push(`> Line ${comment.lineNumber} (${sideLabel}): ${comment.body}`);
    }
    sections.push('');
  }
}
