import { Hono } from "hono";
import { validateToken } from "../auth/jwt";
import type { PassedCollabPayload } from "../durable-objects/types";
import type { Env } from "../env";
import { createLogger } from "../utils/logger";
import { validatePresignedUrlAsync } from "../utils/presigned-url";

/**
 * Collab Room WebSocket route.
 *
 * GET /collab/:roomId (WebSocket upgrade)
 * Query: ?token={presigned_url_token}
 *
 * Validates pre-signed URL token, then forwards WebSocket connection to CollabRoom Durable Object.
 */
export const wsCollabRoute = new Hono<{ Bindings: Env }>();

wsCollabRoute.get("/collab/:roomId", async (c) => {
	const logger = createLogger(c.env);
	const roomId = c.req.param("roomId");
	const token = c.req.query("token");
	const userToken = c.req.query("userToken");

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

	const payload = await validatePresignedUrlAsync(token, c.env.JWT_SECRET);
	if (!payload) {
		return c.json(
			{ error: "invalid_token", message: "Invalid or expired token" },
			401,
		);
	}

	if (payload.roomId !== roomId) {
		logger.warn("roomId mismatch", {
			urlRoomId: roomId,
			tokenRoomId: payload.roomId,
		});
		return c.json(
			{ error: "forbidden", message: "roomId does not match token" },
			403,
		);
	}

	if (Date.now() > payload.exp) {
		return c.json(
			{ error: "expired", message: "Collaboration link has expired" },
			401,
		);
	}

	let userClaims: { sub: string; ghUser: string } | undefined;
	if (userToken) {
		const claims = await validateToken(userToken, c.env.JWT_SECRET);
		if (claims) {
			userClaims = { sub: claims.sub, ghUser: claims.ghUser };
		}
	}

	const doId = c.env.COLLAB_ROOM.idFromName(roomId);
	const room = c.env.COLLAB_ROOM.get(doId);

	const collabPayload: PassedCollabPayload = {
		...payload,
		userClaims,
	};
	const headers = new Headers(c.req.raw.headers);
	headers.set("X-Shipyard-Collab-Payload", JSON.stringify(collabPayload));

	logger.info("Forwarding to CollabRoom", { roomId, taskId: payload.taskId });
	return room.fetch(c.req.raw.url, {
		method: "GET",
		headers,
	});
});
