import { describe, expect, it } from 'vitest';
import { countUniqueFiles, formatBrowserFeedback } from '../utils/format-feedback';

describe('feedback formatting utilities', () => {
  it('returns empty string for no comments', () => {
    const result = formatBrowserFeedback([], []);
    expect(result).toBe('');
  });

  it('includes additional text', () => {
    const result = formatBrowserFeedback([], [], 'Please address these');
    expect(result).toContain('Please address these');
  });

  it('counts unique files', () => {
    expect(
      countUniqueFiles([
        {
          commentId: 'c1',
          filePath: 'a.ts',
          lineNumber: 1,
          side: 'new',
          diffScope: 'working-tree',
          lineContentHash: '',
          body: '',
          authorType: 'human',
          authorId: '',
          createdAt: 0,
          resolvedAt: null,
        },
        {
          commentId: 'c2',
          filePath: 'a.ts',
          lineNumber: 2,
          side: 'new',
          diffScope: 'working-tree',
          lineContentHash: '',
          body: '',
          authorType: 'human',
          authorId: '',
          createdAt: 0,
          resolvedAt: null,
        },
        {
          commentId: 'c3',
          filePath: 'b.ts',
          lineNumber: 1,
          side: 'new',
          diffScope: 'working-tree',
          lineContentHash: '',
          body: '',
          authorType: 'human',
          authorId: '',
          createdAt: 0,
          resolvedAt: null,
        },
      ])
    ).toBe(2);
  });
});
