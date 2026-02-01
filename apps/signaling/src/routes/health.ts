import { Hono } from "hono";
import type { Env } from "../env";
import { ROUTES } from "./routes";

/**
 * Health check route.
 *
 * GET /health
 * Returns: { status: 'ok', service: string, environment: string }
 */
export const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get(ROUTES.HEALTH, (c) => {
	return c.json({
		status: "ok",
		service: "shipyard-signaling",
		environment: c.env.ENVIRONMENT,
	});
});
