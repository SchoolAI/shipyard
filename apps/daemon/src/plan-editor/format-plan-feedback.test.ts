import type { PlanComment } from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';
import { formatPlanFeedbackForClaudeCode } from './format-plan-feedback';

function mockComment(overrides: Partial<PlanComment>): PlanComment {
  return {
    commentId: 'c1',
    planId: 'plan-1',
    from: 0,
    to: 10,
    body: 'test comment',
    authorType: 'human',
    authorId: 'user-1',
    createdAt: Date.now(),
    resolvedAt: null,
    ...overrides,
  };
}

describe('formatPlanFeedbackForClaudeCode', () => {
  it('returns empty string when nothing changed', () => {
    const result = formatPlanFeedbackForClaudeCode('same', 'same', [], null);
    expect(result).toBe('');
  });

  it('includes general feedback section', () => {
    const result = formatPlanFeedbackForClaudeCode(
      'same',
      'same',
      [],
      'Please improve the error handling.'
    );

    expect(result).toContain('## General Feedback');
    expect(result).toContain('Please improve the error handling.');
  });

  it('includes inline comments section', () => {
    const comments = [mockComment({ body: 'Fix this logic' })];

    const result = formatPlanFeedbackForClaudeCode('same', 'same', comments, null);

    expect(result).toContain('## Inline Comments');
    expect(result).toContain('Fix this logic');
  });

  it('formats inline comments as blockquotes', () => {
    const comments = [mockComment({ body: 'Needs refactoring' })];

    const result = formatPlanFeedbackForClaudeCode('same text', 'same text', comments, null);

    expect(result).toMatch(/^>/m);
    expect(result).toContain('Needs refactoring');
  });

  it('includes diff section when text was edited', () => {
    const result = formatPlanFeedbackForClaudeCode('original line', 'edited line', [], null);

    expect(result).toContain('## Edits Made');
    expect(result).toContain('```diff');
    expect(result).toMatch(/-original line/);
    expect(result).toMatch(/\+edited line/);
  });

  it('combines all three sections when all present', () => {
    const comments = [mockComment({ body: 'inline note' })];

    const result = formatPlanFeedbackForClaudeCode(
      'original text',
      'edited text',
      comments,
      'General note here'
    );

    expect(result).toContain('## General Feedback');
    expect(result).toContain('General note here');
    expect(result).toContain('## Inline Comments');
    expect(result).toContain('inline note');
    expect(result).toContain('## Edits Made');
    expect(result).toContain('```diff');
  });

  it('anchors comments near correct text using character offset', () => {
    const editedText = 'Line one\nLine two\nLine three\nLine four\nLine five';
    const comment = mockComment({
      from: 20,
      body: 'Check this line',
    });

    const result = formatPlanFeedbackForClaudeCode(editedText, editedText, [comment], null);

    expect(result).toContain('Near "Line three"');
    expect(result).toContain('Check this line');
  });

  it('handles comments pointing past the document', () => {
    const editedText = 'Short text';
    const comment = mockComment({
      from: 9999,
      body: 'Past end comment',
    });

    const result = formatPlanFeedbackForClaudeCode(editedText, editedText, [comment], null);

    expect(result).toContain('Past end comment');
  });

  it('sorts multiple comments by position', () => {
    const comments = [
      mockComment({ commentId: 'c2', from: 20, body: 'second comment' }),
      mockComment({ commentId: 'c1', from: 5, body: 'first comment' }),
    ];

    const result = formatPlanFeedbackForClaudeCode(
      'same text here that is long enough',
      'same text here that is long enough',
      comments,
      null
    );

    const firstIdx = result.indexOf('first comment');
    const secondIdx = result.indexOf('second comment');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('truncates long line references in comment anchors', () => {
    const longLine = 'A'.repeat(100);
    const editedText = `${longLine}\nShort`;
    const comment = mockComment({ from: 10, body: 'on the long line' });

    const result = formatPlanFeedbackForClaudeCode(editedText, editedText, [comment], null);

    expect(result).toContain('...');
    expect(result).toContain('on the long line');
  });

  it('handles empty edited text with comment past end', () => {
    const comment = mockComment({ from: 100, body: 'lost comment' });

    const result = formatPlanFeedbackForClaudeCode('', '', [comment], null);

    expect(result).toContain('lost comment');
  });
});
