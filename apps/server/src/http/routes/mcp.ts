import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getMcpTransport } from '../../mcp/index.js';

export function createMcpRoute() {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'mcp-session-id', 'Last-Event-ID', 'mcp-protocol-version'],
      exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
    })
  );

  app.all('/mcp', async (c) => {
    const transport = getMcpTransport();
    if (transport === null) {
      return c.json({ error: 'MCP server not initialized' }, 503);
    }
    return transport.handleRequest(c.req.raw);
  });

  return app;
}
