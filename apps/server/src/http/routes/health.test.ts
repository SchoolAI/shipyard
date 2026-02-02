/**
 * Integration tests for health check endpoint.
 *
 * GET /health - Daemon health check for MCP startup validation.
 * @see docs/whips/daemon-mcp-server-merge.md#http-endpoints-interface
 */

import { describe, expect, it } from "vitest";
import { createHealthRoute } from "./health.js";

describe("GET /health", () => {
	it("returns 200 with status ok and uptime when initialized", async () => {
		const startTime = Date.now() - 1000;
		const app = createHealthRoute({ startTime });

		const res = await app.request("/health");

		expect(res.status).toBe(200);
		const json = (await res.json()) as { status: string; uptime: number };
		expect(json.status).toBe("ok");
		expect(json.uptime).toBeGreaterThanOrEqual(1000);
	});

	it("returns 503 when not initialized", async () => {
		const app = createHealthRoute({ startTime: null });

		const res = await app.request("/health");

		expect(res.status).toBe(503);
		const json = (await res.json()) as { status: string; message: string };
		expect(json).toMatchObject({
			status: "error",
			message: "Server not initialized",
		});
	});
});
