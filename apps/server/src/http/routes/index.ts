/**
 * HTTP routes - only 3 endpoints.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#2-http-endpoints-reduced-to-3
 */

import { Hono } from "hono";
import type { GitHubClient } from "../helpers/github.js";
import {
	createGitHubProxyRoutes,
	type GitHubProxyContext,
} from "./github-proxy.js";
import { createHealthRoute, type HealthContext } from "./health.js";

export interface AppContext {
	health: HealthContext;
	github: GitHubProxyContext;
}

/**
 * Create the main HTTP app with all routes registered.
 */
export function createApp(ctx: AppContext) {
	const app = new Hono();

	app.route("/", createHealthRoute(ctx.health));
	app.route("/", createGitHubProxyRoutes(ctx.github));

	app.notFound((c) => {
		return c.json({ error: "not_found", message: "Endpoint not found" }, 404);
	});

	return app;
}

export type { HealthContext, GitHubProxyContext, GitHubClient };
