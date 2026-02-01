import { ROUTES } from "@shipyard/signaling";
import { Hono } from "hono";
import { validateToken } from "../auth/jwt";
import type { Env } from "../env";
import { createLogger } from "../utils/logger";
import {
	forbiddenResponse,
	invalidTokenResponse,
	requireQueryParam,
	requireWebSocketUpgrade,
} from "../utils/route-helpers";

/**
 * Personal Room WebSocket route.
 *
 * GET /personal/:userId (WebSocket upgrade)
 * Query: ?token={shipyard_jwt}
 *
 * Validates JWT, then forwards WebSocket connection to PersonalRoom Durable Object.
 */
export const wsPersonalRoute = new Hono<{ Bindings: Env }>();

wsPersonalRoute.get(ROUTES.WS_PERSONAL, async (c) => {
	const logger = createLogger(c.env);
	const userId = c.req.param("userId");

	const upgradeResult = requireWebSocketUpgrade(c);
	if (!upgradeResult.ok) return upgradeResult.error;

	const tokenResult = requireQueryParam(c, "token");
	if (!tokenResult.ok) return tokenResult.error;

	const claims = await validateToken(tokenResult.value, c.env.JWT_SECRET);
	if (!claims) {
		return invalidTokenResponse(c);
	}

	if (claims.sub !== userId) {
		logger.warn("userId mismatch", { urlUserId: userId, tokenSub: claims.sub });
		return forbiddenResponse(c, "userId does not match token");
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
