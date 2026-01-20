import { describe, expect, it } from 'vitest';
import { GitHubPRResponseSchema } from './github-validation.js';

describe('GitHubPRResponseSchema', () => {
  it('should validate a complete GitHub PR response', () => {
    const validResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      title: 'Add new feature',
      state: 'open' as const,
      draft: false,
      merged: false,
      head: {
        ref: 'feature-branch',
      },
    };

    const result = GitHubPRResponseSchema.parse(validResponse);

    expect(result).toEqual(validResponse);
    expect(result.number).toBe(42);
    expect(result.state).toBe('open');
  });

  it('should validate a merged PR response', () => {
    const mergedResponse = {
      number: 100,
      html_url: 'https://github.com/owner/repo/pull/100',
      title: 'Fix bug',
      state: 'closed' as const,
      draft: false,
      merged: true,
      head: {
        ref: 'bugfix-branch',
      },
    };

    const result = GitHubPRResponseSchema.parse(mergedResponse);

    expect(result.merged).toBe(true);
    expect(result.state).toBe('closed');
  });

  it('should reject response with missing draft and merged fields', () => {
    const minimalResponse = {
      number: 1,
      html_url: 'https://github.com/owner/repo/pull/1',
      title: 'Initial PR',
      state: 'open' as const,
      head: {
        ref: 'main',
      },
    };

    expect(() => GitHubPRResponseSchema.parse(minimalResponse)).toThrow();
  });

  it('should reject response with missing required fields', () => {
    const invalidResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      state: 'open',
      draft: false,
      merged: false,
      head: {
        ref: 'feature-branch',
      },
    };

    expect(() => GitHubPRResponseSchema.parse(invalidResponse)).toThrow();
  });

  it('should reject response with invalid URL', () => {
    const invalidUrlResponse = {
      number: 42,
      html_url: 'not-a-valid-url',
      title: 'Add feature',
      state: 'open' as const,
      draft: false,
      merged: false,
      head: {
        ref: 'feature-branch',
      },
    };

    expect(() => GitHubPRResponseSchema.parse(invalidUrlResponse)).toThrow();
  });

  it('should reject response with invalid state', () => {
    const invalidStateResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      title: 'Add feature',
      state: 'invalid-state',
      draft: false,
      merged: false,
      head: {
        ref: 'feature-branch',
      },
    };

    expect(() => GitHubPRResponseSchema.parse(invalidStateResponse)).toThrow();
  });

  it('should reject response with missing head.ref', () => {
    const missingBranchResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      title: 'Add feature',
      state: 'open' as const,
      draft: false,
      merged: false,
      head: {},
    };

    expect(() => GitHubPRResponseSchema.parse(missingBranchResponse)).toThrow();
  });

  it('should reject response with null title', () => {
    const nullTitleResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      title: null,
      state: 'open' as const,
      draft: false,
      merged: false,
      head: {
        ref: 'feature-branch',
      },
    };

    expect(() => GitHubPRResponseSchema.parse(nullTitleResponse)).toThrow();
  });

  it('should reject response with undefined branch', () => {
    const undefinedBranchResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      title: 'Add feature',
      state: 'open' as const,
      draft: false,
      merged: false,
      head: {
        ref: undefined,
      },
    };

    expect(() => GitHubPRResponseSchema.parse(undefinedBranchResponse)).toThrow();
  });

  it('should accept draft PR', () => {
    const draftResponse = {
      number: 42,
      html_url: 'https://github.com/owner/repo/pull/42',
      title: 'WIP: New feature',
      state: 'open' as const,
      draft: true,
      merged: false,
      head: {
        ref: 'feature-branch',
      },
    };

    const result = GitHubPRResponseSchema.parse(draftResponse);

    expect(result.draft).toBe(true);
    expect(result.state).toBe('open');
  });
});
