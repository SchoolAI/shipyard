/**
 * Health check endpoint.
 *
 * GET /health - Returns daemon health status for MCP startup validation.
 */

import { Hono } from "hono";
import { ROUTES } from "../../client/index.js";

export interface HealthContext {
	startTime: number | null;
}

/**
 * Create health route with injected context.
 */
export function createHealthRoute(ctx: HealthContext) {
	const app = new Hono();

	app.get(ROUTES.HEALTH, (c) => {
		if (ctx.startTime === null) {
			return c.json(
				{
					status: "error",
					message: "Server not initialized",
				},
				503,
			);
		}

		return c.json({
			status: "ok",
			uptime: Date.now() - ctx.startTime,
		});
	});

	return app;
}
