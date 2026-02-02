/**
 * HTTP routes - only 3 endpoints.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#2-http-endpoints-reduced-to-3
 */

import type { Express } from "express";
import { prDiffRoute, prFilesRoute } from "./github-proxy.js";
import { healthRoute } from "./health.js";

/**
 * Register all HTTP routes on the Express app.
 */
export function registerRoutes(app: Express): void {
	app.get("/health", healthRoute);
	app.get("/api/plans/:id/pr-diff/:prNumber", prDiffRoute);
	app.get("/api/plans/:id/pr-files/:prNumber", prFilesRoute);
}
