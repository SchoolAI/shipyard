import type { DiffComment, PlanComment } from '@shipyard/loro-schema';

function groupByFile(comments: DiffComment[]): Map<string, DiffComment[]> {
  const byFile = new Map<string, DiffComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath) ?? [];
    existing.push(c);
    byFile.set(c.filePath, existing);
  }
  return byFile;
}

function formatDiffSection(diffComments: DiffComment[]): string[] {
  const parts: string[] = [];
  parts.push('## Inline Comments on Code Changes\n');
  parts.push('The user left the following comments on the diff:\n');

  for (const [filePath, fileComments] of groupByFile(diffComments)) {
    parts.push(`### ${filePath}\n`);
    const sorted = [...fileComments].sort((a, b) => a.lineNumber - b.lineNumber);
    for (const comment of sorted) {
      const sideLabel = comment.side === 'old' ? 'before change' : 'after change';
      parts.push(`> Line ${comment.lineNumber} (${sideLabel}): ${comment.body}`);
    }
    parts.push('');
  }

  return parts;
}

function formatPlanSection(planComments: PlanComment[]): string[] {
  const parts: string[] = [];
  parts.push('## Inline Comments on Plan\n');
  const sorted = [...planComments].sort((a, b) => a.from - b.from);
  for (const c of sorted) {
    parts.push(`> ${c.body}`);
  }
  parts.push('');
  return parts;
}

export function formatBrowserFeedback(
  diffComments: DiffComment[],
  planComments: PlanComment[],
  additionalText?: string
): string {
  const parts: string[] = [];

  if (additionalText?.trim()) {
    parts.push(additionalText.trim());
    parts.push('');
  }

  if (diffComments.length > 0) {
    parts.push(...formatDiffSection(diffComments));
  }

  if (planComments.length > 0) {
    parts.push(...formatPlanSection(planComments));
  }

  return parts.join('\n').trim();
}

export function countUniqueFiles(comments: DiffComment[]): number {
  return new Set(comments.map((c) => c.filePath)).size;
}
