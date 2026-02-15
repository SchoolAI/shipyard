import { describe, expect, it } from 'vitest';
import { extractPlanMarkdown } from './plan-helpers.js';

describe('extractPlanMarkdown', () => {
  it('extracts plan string from valid JSON with plan field', () => {
    const input = JSON.stringify({ plan: '## Step 1\nDo the thing' });
    expect(extractPlanMarkdown(input)).toBe('## Step 1\nDo the thing');
  });

  it('returns empty string when JSON has no plan field', () => {
    const input = JSON.stringify({ other: 'value' });
    expect(extractPlanMarkdown(input)).toBe('');
  });

  it('returns empty string for malformed JSON', () => {
    expect(extractPlanMarkdown('not valid json {')).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(extractPlanMarkdown('')).toBe('');
  });

  it('returns empty string when plan field is not a string', () => {
    const input = JSON.stringify({ plan: 42 });
    expect(extractPlanMarkdown(input)).toBe('');
  });

  it('returns empty string when plan field is null', () => {
    const input = JSON.stringify({ plan: null });
    expect(extractPlanMarkdown(input)).toBe('');
  });

  it('returns empty string when plan field is an array', () => {
    const input = JSON.stringify({ plan: ['step 1', 'step 2'] });
    expect(extractPlanMarkdown(input)).toBe('');
  });

  it('preserves whitespace in plan markdown', () => {
    const markdown = '  indented\n\n  double spaced\n';
    const input = JSON.stringify({ plan: markdown });
    expect(extractPlanMarkdown(input)).toBe(markdown);
  });
});
