import { Hono } from "hono";
import { validateToken } from "../auth/jwt";
import type { Env } from "../env";
import { createLogger } from "../utils/logger";

/**
 * Personal Room WebSocket route.
 *
 * GET /personal/:userId (WebSocket upgrade)
 * Query: ?token={shipyard_jwt}
 *
 * Validates JWT, then forwards WebSocket connection to PersonalRoom Durable Object.
 */
export const wsPersonalRoute = new Hono<{ Bindings: Env }>();

wsPersonalRoute.get("/personal/:userId", async (c) => {
	const logger = createLogger(c.env);
	const userId = c.req.param("userId");
	const token = c.req.query("token");

	const upgradeHeader = c.req.header("Upgrade");
	if (upgradeHeader !== "websocket") {
		return c.json(
			{ error: "upgrade_required", message: "WebSocket upgrade required" },
			426,
		);
	}

	if (!token) {
		return c.json(
			{ error: "missing_token", message: "token query param required" },
			401,
		);
	}

	const claims = await validateToken(token, c.env.JWT_SECRET);
	if (!claims) {
		return c.json(
			{ error: "invalid_token", message: "Invalid or expired token" },
			401,
		);
	}

	if (claims.sub !== userId) {
		logger.warn("userId mismatch", { urlUserId: userId, tokenSub: claims.sub });
		return c.json(
			{ error: "forbidden", message: "userId does not match token" },
			403,
		);
	}

	const roomId = c.env.PERSONAL_ROOM.idFromName(userId);
	const room = c.env.PERSONAL_ROOM.get(roomId);

	const headers = new Headers(c.req.raw.headers);
	headers.set("X-Shipyard-Claims", JSON.stringify(claims));

	logger.info("Forwarding to PersonalRoom", { userId });
	return room.fetch(c.req.raw.url, {
		method: "GET",
		headers,
	});
});
