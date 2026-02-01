import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../env";
import { isAllowedOrigin } from "../utils/cors";
import { createLogger } from "../utils/logger";
import { authGitHubRoute } from "./auth-github";
import { collabCreateRoute } from "./collab-create";
import { healthRoute } from "./health";
import { wsCollabRoute } from "./ws-collab";
import { wsPersonalRoute } from "./ws-personal";

/**
 * Main Hono application with all routes registered.
 */
export const app = new Hono<{ Bindings: Env }>();

// Global middleware: logging
app.use("*", async (c, next) => {
	const logger = createLogger(c.env);
	c.set("logger" as never, logger);
	const start = Date.now();
	await next();
	logger.info("request", {
		method: c.req.method,
		path: c.req.path,
		status: c.res.status,
		duration: Date.now() - start,
	});
});

// Global middleware: CORS
app.use(
	"*",
	cors({
		origin: (origin, c) => {
			if (isAllowedOrigin(origin, c.env)) {
				return origin;
			}
			return null;
		},
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "Upgrade", "Connection"],
	}),
);

// Mount routes
app.route("/", healthRoute);
app.route("/", authGitHubRoute);
app.route("/", collabCreateRoute);
app.route("/", wsPersonalRoute);
app.route("/", wsCollabRoute);

// Catch-all 404
app.notFound((c) => {
	return c.json(
		{
			error: "not_found",
			message: "Endpoint not found",
			endpoints: [
				"GET /health",
				"POST /auth/github/callback",
				"POST /collab/create",
				"WS /personal/:userId",
				"WS /collab/:roomId",
			],
		},
		404,
	);
});

// Global error handler
app.onError((err, c) => {
	const logger = createLogger(c.env);
	logger.error("unhandled error", { error: err.message, stack: err.stack });
	return c.json(
		{ error: "internal_error", message: "Internal server error" },
		500,
	);
});
