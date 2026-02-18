import type { PlanComment } from '@shipyard/loro-schema';

/**
 * Format plan edits and comments into structured feedback for Claude Code.
 *
 * Produces a markdown document combining:
 * 1. General feedback (if any)
 * 2. Inline comments anchored to nearby content
 * 3. Line-level diff of edits between original and edited markdown
 */
export function formatPlanFeedbackForClaudeCode(
  original: string,
  edited: string,
  comments: PlanComment[],
  generalFeedback: string | null
): string {
  const sections: string[] = [];

  if (generalFeedback) {
    sections.push('## General Feedback\n');
    sections.push(generalFeedback);
    sections.push('');
  }

  if (comments.length > 0) {
    appendCommentSection(sections, comments, edited);
  }

  if (original !== edited) {
    sections.push('## Edits Made\n');
    sections.push('The user edited the following sections of the plan:\n');
    sections.push('```diff');
    sections.push(computeLineDiff(original, edited));
    sections.push('```');
    sections.push('');
  }

  return sections.join('\n').trim();
}

function appendCommentSection(sections: string[], comments: PlanComment[], edited: string): void {
  sections.push('## Inline Comments\n');
  sections.push('The user left the following comments on specific parts of the plan:\n');

  const editedLines = edited.split('\n');
  const sorted = [...comments].sort((a, b) => a.from - b.from);

  for (const comment of sorted) {
    const nearbyLine = findNearestLine(editedLines, comment.from);
    if (nearbyLine) {
      sections.push(`> Near "${truncate(nearbyLine, 60)}": ${comment.body}`);
    } else {
      sections.push(`> ${comment.body}`);
    }
  }
  sections.push('');
}

/**
 * The `from` value is a character position in the edited text.
 */
function findNearestLine(lines: string[], charOffset: number): string | null {
  let pos = 0;
  for (const line of lines) {
    if (pos + line.length >= charOffset) {
      const trimmed = line.trim();
      if (trimmed.length > 0) return trimmed;
    }
    pos += line.length + 1;
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]?.trim();
    if (trimmed && trimmed.length > 0) return trimmed;
  }
  return null;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function computeLineDiff(original: string, edited: string): string {
  const oldLines = original.split('\n');
  const newLines = edited.split('\n');

  const result: string[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length && ni < newLines.length) {
    if (oldLines[oi] === newLines[ni]) {
      result.push(` ${oldLines[oi]}`);
      oi++;
      ni++;
    } else {
      const consumed = consumeMismatch(oldLines, newLines, oi, ni, result);
      oi = consumed.oi;
      ni = consumed.ni;
    }
  }

  appendRemainder(result, oldLines, oi, '-');
  appendRemainder(result, newLines, ni, '+');

  return result.join('\n');
}

function consumeMismatch(
  oldLines: string[],
  newLines: string[],
  oi: number,
  ni: number,
  result: string[]
): { oi: number; ni: number } {
  const newInOld = findNext(oldLines, newLines[ni], oi);
  const oldInNew = findNext(newLines, oldLines[oi], ni);

  if (newInOld !== null && (oldInNew === null || newInOld - oi <= oldInNew - ni)) {
    while (oi < newInOld) {
      result.push(`-${oldLines[oi]}`);
      oi++;
    }
  } else if (oldInNew !== null) {
    while (ni < oldInNew) {
      result.push(`+${newLines[ni]}`);
      ni++;
    }
  } else {
    result.push(`-${oldLines[oi]}`);
    result.push(`+${newLines[ni]}`);
    oi++;
    ni++;
  }
  return { oi, ni };
}

function appendRemainder(result: string[], lines: string[], start: number, prefix: string): void {
  for (let i = start; i < lines.length; i++) {
    result.push(`${prefix}${lines[i]}`);
  }
}

function findNext(lines: string[], target: string | undefined, from: number): number | null {
  if (target === undefined) return null;
  const lookAhead = 5;
  for (let i = from; i < Math.min(from + lookAhead, lines.length); i++) {
    if (lines[i] === target) return i;
  }
  return null;
}
