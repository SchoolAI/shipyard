import { ROUTES } from "@shipyard/signaling";
import { Hono } from "hono";
import { validateToken } from "../auth/jwt";
import type { PassedCollabPayload } from "../durable-objects/types";
import type { Env } from "../env";
import { createLogger } from "../utils/logger";
import { validatePresignedUrlAsync } from "../utils/presigned-url";
import {
	expiredResponse,
	forbiddenResponse,
	invalidTokenResponse,
	requireQueryParam,
	requireWebSocketUpgrade,
} from "../utils/route-helpers";

/**
 * Collab Room WebSocket route.
 *
 * GET /collab/:roomId (WebSocket upgrade)
 * Query: ?token={presigned_url_token}
 *
 * Validates pre-signed URL token, then forwards WebSocket connection to CollabRoom Durable Object.
 */
export const wsCollabRoute = new Hono<{ Bindings: Env }>();

wsCollabRoute.get(ROUTES.WS_COLLAB, async (c) => {
	const logger = createLogger(c.env);
	const roomId = c.req.param("roomId");
	const userToken = c.req.query("userToken");

	const upgradeResult = requireWebSocketUpgrade(c);
	if (!upgradeResult.ok) return upgradeResult.error;

	const tokenResult = requireQueryParam(c, "token");
	if (!tokenResult.ok) return tokenResult.error;

	const payload = await validatePresignedUrlAsync(
		tokenResult.value,
		c.env.JWT_SECRET,
	);
	if (!payload) {
		return invalidTokenResponse(c);
	}

	if (payload.roomId !== roomId) {
		logger.warn("roomId mismatch", {
			urlRoomId: roomId,
			tokenRoomId: payload.roomId,
		});
		return forbiddenResponse(c, "roomId does not match token");
	}

	if (Date.now() > payload.exp) {
		return expiredResponse(c, "Collaboration link has expired");
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
