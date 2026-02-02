/**
 * Integration tests for route registration.
 *
 * Verifies that all 3 HTTP endpoints are properly mounted.
 * @see docs/whips/daemon-mcp-server-merge.md#2-http-endpoints-reduced-to-3
 */

import { describe, it } from "vitest";

describe("Route Registration", () => {
	describe("registerRoutes", () => {
		it.todo("mounts GET /health endpoint");
		it.todo("mounts GET /api/plans/:id/pr-diff/:prNumber endpoint");
		it.todo("mounts GET /api/plans/:id/pr-files/:prNumber endpoint");
		it.todo("only registers exactly 3 routes");
	});

	describe("404 handling", () => {
		it.todo("returns 404 JSON for unknown routes");
	});
});
