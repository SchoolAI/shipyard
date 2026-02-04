import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { GitHubClient } from '../helpers/github.js';
import { createGitHubProxyRoutes, type GitHubProxyContext } from './github-proxy.js';
import { createHealthRoute, type HealthContext } from './health.js';
import { createMcpRoute } from './mcp.js';

export interface AppContext {
  health: HealthContext;
  github: GitHubProxyContext;
}

export function createApp(ctx: AppContext) {
  const app = new Hono();

  // Enable CORS for browser requests (health checks, API calls)
  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Allow localhost origins for development
        if (!origin) return '*';
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return origin;
        }
        // Allow GitHub Pages and Cloudflare Workers
        if (origin.includes('github.io') || origin.includes('workers.dev')) {
          return origin;
        }
        return '*';
      },
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Accept', 'Authorization'],
    })
  );

  app.route('/', createHealthRoute(ctx.health));
  app.route('/', createGitHubProxyRoutes(ctx.github));
  app.route('/', createMcpRoute());

  app.notFound((c) => {
    return c.json({ error: 'not_found', message: 'Endpoint not found' }, 404);
  });

  return app;
}

export type { HealthContext, GitHubProxyContext, GitHubClient };
