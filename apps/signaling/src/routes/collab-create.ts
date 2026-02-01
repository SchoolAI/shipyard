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

/**
 * Create collaboration room route.
 *
 * POST /collab/create
 * Auth: Bearer {shipyard_jwt} required
 * Body: { taskId: string, expiresInMinutes?: number }
 * Returns: { url: string, roomId: string, expiresAt: number }
 */
export const collabCreateRoute = new Hono<{ Bindings: Env }>();

collabCreateRoute.post("/collab/create", async (c) => {
	const logger = createLogger(c.env);

	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json(
			{ error: "unauthorized", message: "Bearer token required" },
			401,
		);
	}

	const token = authHeader.slice(7);
	const claims = await validateToken(token, c.env.JWT_SECRET);
	if (!claims) {
		return c.json(
			{ error: "invalid_token", message: "Invalid or expired token" },
			401,
		);
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid_body", message: "Invalid JSON body" }, 400);
	}

	const parseResult = CreateCollabRequestSchema.safeParse(body);
	if (!parseResult.success) {
		return c.json(
			{
				error: "validation_error",
				message: "Invalid request body",
				details: parseResult.error.issues,
			},
			400,
		);
	}

	const { taskId, expiresInMinutes } = parseResult.data;

	const roomId = generateId(16);
	const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

	const baseUrl =
		c.env.ENVIRONMENT === "production"
			? "https://shipyard-signaling.jacob-191.workers.dev"
			: `http://localhost:4444`;

	const presignedUrl = await generatePresignedUrlAsync(
		baseUrl,
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
