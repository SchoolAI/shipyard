/**
 * Integration tests for MCP proxy route.
 */

import { describe, expect, it } from 'vitest';
import { createMcpRoute } from './mcp.js';

describe('createMcpRoute', () => {
  it('creates MCP route handler', () => {
    const app = createMcpRoute();
    expect(app).toBeDefined();
  });

  it('returns 503 when MCP transport not initialized', async () => {
    const app = createMcpRoute();
    const req = new Request('http://localhost/mcp', { method: 'POST' });
    const res = await app.request(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ error: 'MCP server not initialized' });
  });
});
