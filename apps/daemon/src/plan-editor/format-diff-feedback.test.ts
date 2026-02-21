import type { DiffComment } from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';
import { formatDiffFeedbackForClaudeCode } from './format-diff-feedback';

function mockComment(overrides: Partial<DiffComment>): DiffComment {
  return {
    commentId: 'c1',
    filePath: 'src/index.ts',
    lineNumber: 10,
    side: 'new',
    diffScope: 'working-tree',
    lineContentHash: '',
    body: 'test comment',
    authorType: 'human',
    authorId: 'user-1',
    createdAt: Date.now(),
    resolvedAt: null,
    ...overrides,
  };
}

describe('formatDiffFeedbackForClaudeCode', () => {
  it('returns empty string when no comments and no feedback', () => {
    const result = formatDiffFeedbackForClaudeCode([], null);
    expect(result).toBe('');
  });

  it('includes general feedback section', () => {
    const result = formatDiffFeedbackForClaudeCode([], 'Please fix the auth flow.');
    expect(result).toContain('## General Feedback');
    expect(result).toContain('Please fix the auth flow.');
  });

  it('includes inline comments section', () => {
    const comments = [mockComment({ body: 'This needs error handling' })];
    const result = formatDiffFeedbackForClaudeCode(comments, null);
    expect(result).toContain('## Inline Comments on Code Changes');
    expect(result).toContain('This needs error handling');
  });

  it('groups comments by file', () => {
    const comments = [
      mockComment({ commentId: 'c1', filePath: 'src/a.ts', lineNumber: 5, body: 'comment on a' }),
      mockComment({ commentId: 'c2', filePath: 'src/b.ts', lineNumber: 10, body: 'comment on b' }),
      mockComment({ commentId: 'c3', filePath: 'src/a.ts', lineNumber: 15, body: 'another on a' }),
    ];
    const result = formatDiffFeedbackForClaudeCode(comments, null);

    expect(result).toContain('### src/a.ts');
    expect(result).toContain('### src/b.ts');
    expect(result).toContain('comment on a');
    expect(result).toContain('another on a');
    expect(result).toContain('comment on b');
  });

  it('sorts comments by line number within a file', () => {
    const comments = [
      mockComment({ commentId: 'c1', lineNumber: 20, body: 'second' }),
      mockComment({ commentId: 'c2', lineNumber: 5, body: 'first' }),
    ];
    const result = formatDiffFeedbackForClaudeCode(comments, null);

    const firstIdx = result.indexOf('first');
    const secondIdx = result.indexOf('second');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('includes side label for old vs new', () => {
    const comments = [
      mockComment({ commentId: 'c1', side: 'old', body: 'old side comment' }),
      mockComment({ commentId: 'c2', side: 'new', lineNumber: 20, body: 'new side comment' }),
    ];
    const result = formatDiffFeedbackForClaudeCode(comments, null);

    expect(result).toContain('(before change)');
    expect(result).toContain('(after change)');
  });

  it('formats comments as blockquotes with line numbers', () => {
    const comments = [mockComment({ lineNumber: 42, body: 'fix this' })];
    const result = formatDiffFeedbackForClaudeCode(comments, null);
    expect(result).toMatch(/^> Line 42/m);
  });

  it('combines general feedback and comments', () => {
    const comments = [mockComment({ body: 'inline note' })];
    const result = formatDiffFeedbackForClaudeCode(comments, 'Overall looks good');

    expect(result).toContain('## General Feedback');
    expect(result).toContain('Overall looks good');
    expect(result).toContain('## Inline Comments on Code Changes');
    expect(result).toContain('inline note');
  });
});
