/**
 * Integration tests for GitHub API proxy endpoints.
 *
 * These endpoints exist because browser can't call GitHub API directly (CORS).
 * @see docs/whips/daemon-mcp-server-merge.md#http-endpoints-interface
 */

import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient, PRFile } from '../helpers/github.js';
import { createGitHubProxyRoutes, type GitHubProxyContext } from './github-proxy.js';

function createMockClient(overrides?: Partial<GitHubClient>): GitHubClient {
  return {
    getPRDiff: vi.fn().mockResolvedValue('mock diff content'),
    getPRFiles: vi.fn().mockResolvedValue([
      {
        path: 'src/index.ts',
        additions: 10,
        deletions: 5,
        status: 'modified',
      },
    ] satisfies PRFile[]),
    ...overrides,
  };
}

function createTestContext(overrides?: Partial<GitHubProxyContext>): GitHubProxyContext {
  const client = createMockClient();
  return {
    getClient: () => client,
    parseRepo: () => ({ owner: 'test-owner', repo: 'test-repo' }),
    ...overrides,
  };
}

describe('GET /api/plans/:id/pr-diff/:prNumber', () => {
  it('returns 200 with raw diff text', async () => {
    const app = createGitHubProxyRoutes(createTestContext());

    const res = await app.request('/api/plans/plan123/pr-diff/42');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('mock diff content');
  });

  it('returns 404 when PR not found', async () => {
    const error = new Error('Not Found') as Error & { status: number };
    error.status = 404;
    const client = createMockClient({
      getPRDiff: vi.fn().mockRejectedValue(error),
    });
    const app = createGitHubProxyRoutes({
      getClient: () => client,
      parseRepo: () => ({ owner: 'test', repo: 'repo' }),
    });

    const res = await app.request('/api/plans/plan123/pr-diff/42');

    expect(res.status).toBe(404);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('not_found');
  });

  it('returns 500 on GitHub API error', async () => {
    const error = new Error('Rate limited');
    const client = createMockClient({
      getPRDiff: vi.fn().mockRejectedValue(error),
    });
    const app = createGitHubProxyRoutes({
      getClient: () => client,
      parseRepo: () => ({ owner: 'test', repo: 'repo' }),
    });

    const res = await app.request('/api/plans/plan123/pr-diff/42');

    expect(res.status).toBe(500);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('github_error');
  });

  it('returns 404 for invalid PR number', async () => {
    const app = createGitHubProxyRoutes(createTestContext());

    const res = await app.request('/api/plans/plan123/pr-diff/invalid');

    expect(res.status).toBe(404);
    const json = (await res.json()) as { code: string; message: string };
    expect(json.code).toBe('not_found');
    expect(json.message).toBe('Invalid PR number');
  });
});

describe('GET /api/plans/:id/pr-files/:prNumber', () => {
  it('returns 200 with file list array', async () => {
    const app = createGitHubProxyRoutes(createTestContext());

    const res = await app.request('/api/plans/plan123/pr-files/42');

    expect(res.status).toBe(200);
    const json = (await res.json()) as PRFile[];
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({
      path: 'src/index.ts',
      additions: 10,
      deletions: 5,
      status: 'modified',
    });
  });

  it('returns 404 when PR not found', async () => {
    const error = new Error('Not Found') as Error & { status: number };
    error.status = 404;
    const client = createMockClient({
      getPRFiles: vi.fn().mockRejectedValue(error),
    });
    const app = createGitHubProxyRoutes({
      getClient: () => client,
      parseRepo: () => ({ owner: 'test', repo: 'repo' }),
    });

    const res = await app.request('/api/plans/plan123/pr-files/42');

    expect(res.status).toBe(404);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('not_found');
  });

  it('returns 500 on GitHub API error', async () => {
    const error = new Error('Connection failed');
    const client = createMockClient({
      getPRFiles: vi.fn().mockRejectedValue(error),
    });
    const app = createGitHubProxyRoutes({
      getClient: () => client,
      parseRepo: () => ({ owner: 'test', repo: 'repo' }),
    });

    const res = await app.request('/api/plans/plan123/pr-files/42');

    expect(res.status).toBe(500);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('github_error');
  });

  it('returns 404 for invalid PR number', async () => {
    const app = createGitHubProxyRoutes(createTestContext());

    const res = await app.request('/api/plans/plan123/pr-files/-1');

    expect(res.status).toBe(404);
    const json = (await res.json()) as { code: string; message: string };
    expect(json.code).toBe('not_found');
    expect(json.message).toBe('Invalid PR number');
  });
});
