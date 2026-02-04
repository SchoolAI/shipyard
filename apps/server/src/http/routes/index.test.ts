/**
 * Integration tests for route registration.
 *
 * Verifies that all 3 HTTP endpoints are properly mounted.
 * @see docs/whips/daemon-mcp-server-merge.md#2-http-endpoints-reduced-to-3
 */

import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../client/index.js';
import type { GitHubClient } from '../helpers/github.js';
import { type AppContext, createApp } from './index.js';

function createTestContext(): AppContext {
  const mockClient: GitHubClient = {
    getPRDiff: vi.fn().mockResolvedValue('diff'),
    getPRFiles: vi.fn().mockResolvedValue([]),
  };
  return {
    health: { startTime: Date.now() },
    github: {
      getClient: () => mockClient,
      parseRepo: () => ({ owner: 'test', repo: 'test' }),
    },
  };
}

describe('Route Registration', () => {
  it('mounts GET /health endpoint', async () => {
    const app = createApp(createTestContext());

    const res = await app.request(ROUTES.HEALTH);

    expect(res.status).toBe(200);
  });

  it('mounts GET /api/plans/:id/pr-diff/:prNumber endpoint', async () => {
    const app = createApp(createTestContext());

    const res = await app.request('/api/plans/plan1/pr-diff/1');

    expect(res.status).toBe(200);
  });

  it('mounts GET /api/plans/:id/pr-files/:prNumber endpoint', async () => {
    const app = createApp(createTestContext());

    const res = await app.request('/api/plans/plan1/pr-files/1');

    expect(res.status).toBe(200);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const app = createApp(createTestContext());

    const res = await app.request('/unknown/route');

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('not_found');
  });
});
