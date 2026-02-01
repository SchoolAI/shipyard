import { Hono } from "hono";
import { validateToken } from "../auth/jwt";
import type { Env } from "../env";
import {
	CreateCollabRequestSchema,
	type CreateCollabResponse,
} from "../protocol/messages";
import { generateId } from "../utils/crypto";
import { createLogger } from "../utils/logger";
import { generatePresignedUrlAsync } from "../utils/presigned-url";
import {
	extractBearerToken,
	invalidTokenResponse,
	parseAndValidateBody,
} from "../utils/route-helpers";
import { ROUTES } from "./routes";

/**
 * Create collaboration room route.
 *
 * POST /collab/create
 * Auth: Bearer {shipyard_jwt} required
 * Body: { taskId: string, expiresInMinutes?: number }
 * Returns: { url: string, roomId: string, expiresAt: number }
 */
export const collabCreateRoute = new Hono<{ Bindings: Env }>();

collabCreateRoute.post(ROUTES.COLLAB_CREATE, async (c) => {
	const logger = createLogger(c.env);

	const tokenResult = extractBearerToken(c);
	if (!tokenResult.ok) return tokenResult.error;

	const claims = await validateToken(tokenResult.value, c.env.JWT_SECRET);
	if (!claims) {
		return invalidTokenResponse(c);
	}

	const bodyResult = await parseAndValidateBody(c, CreateCollabRequestSchema);
	if (!bodyResult.ok) return bodyResult.error;

	const { taskId, expiresInMinutes } = bodyResult.value;

	const roomId = generateId(16);
	const expiresAt = Date.now() + (expiresInMinutes ?? 60) * 60 * 1000;

	const presignedUrl = await generatePresignedUrlAsync(
		c.env.BASE_URL,
		{
			roomId,
			taskId,
			inviterId: claims.sub,
			exp: expiresAt,
		},
		c.env.JWT_SECRET,
	);

	const response: CreateCollabResponse = {
		url: presignedUrl,
		roomId,
		expiresAt,
	};

	logger.info("Collab room created", { roomId, taskId, inviterId: claims.sub });
	return c.json(response);
});
