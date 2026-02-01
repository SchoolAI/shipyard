/**
 * Zod schemas for all signaling server request/response bodies.
 *
 * This module provides:
 * - Validation schemas for all HTTP endpoints
 * - Inferred TypeScript types for type-safe API usage
 * - Error response schemas for consistent error handling
 *
 * @module schemas
 */

import { z } from "zod";

/**
 * Standard error response schema used across all endpoints.
 */
export const ErrorResponseSchema = z.object({
	error: z.string(),
	message: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Validation error response with field-level details.
 */
export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
	details: z
		.array(
			z.object({
				path: z.array(z.union([z.string(), z.number()])),
				message: z.string(),
				code: z.string().optional(),
			}),
		)
		.optional(),
});

export type ValidationErrorResponse = z.infer<
	typeof ValidationErrorResponseSchema
>;

/**
 * Not found error response with available endpoints.
 */
export const NotFoundResponseSchema = ErrorResponseSchema.extend({
	endpoints: z.array(z.string()),
});

export type NotFoundResponse = z.infer<typeof NotFoundResponseSchema>;

/**
 * GET /health response schema.
 *
 * Returns service health status and environment info.
 */
export const HealthResponseSchema = z.object({
	status: z.literal("ok"),
	service: z.literal("shipyard-signaling"),
	environment: z.enum(["development", "production"]),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * POST /auth/github/callback request body schema.
 *
 * Used to exchange a GitHub OAuth code for a Shipyard JWT.
 */
export const AuthGitHubCallbackRequestSchema = z.object({
	/** GitHub OAuth authorization code */
	code: z.string().min(1, "code is required"),
	/** OAuth redirect URI that was used in the authorize request */
	redirect_uri: z.string().url("redirect_uri must be a valid URL"),
});

export type AuthGitHubCallbackRequest = z.infer<
	typeof AuthGitHubCallbackRequestSchema
>;

/**
 * User info returned from successful OAuth.
 */
export const OAuthUserSchema = z.object({
	/** Shipyard user ID (derived from GitHub ID, e.g., 'gh_12345') */
	id: z.string(),
	/** GitHub username */
	username: z.string(),
});

export type OAuthUser = z.infer<typeof OAuthUserSchema>;

/**
 * POST /auth/github/callback response schema.
 *
 * Returns a Shipyard JWT and user info on successful OAuth.
 */
export const AuthGitHubCallbackResponseSchema = z.object({
	/** Shipyard JWT for authentication */
	token: z.string(),
	/** User info from GitHub */
	user: OAuthUserSchema,
	/** Present and true if request came from a mobile device */
	is_mobile: z.boolean().optional(),
});

export type AuthGitHubCallbackResponse = z.infer<
	typeof AuthGitHubCallbackResponseSchema
>;

/**
 * POST /collab/create request body schema.
 *
 * Used to create a new collaboration room with a pre-signed URL.
 */
export const CollabCreateRequestSchema = z.object({
	/** ID of the task to collaborate on */
	taskId: z.string().min(1, "taskId is required"),
	/** How long the collaboration link should be valid (1-1440 minutes, default 60) */
	expiresInMinutes: z.number().min(1).max(1440).default(60),
});

export type CollabCreateRequest = z.infer<typeof CollabCreateRequestSchema>;

/**
 * POST /collab/create response schema.
 *
 * Returns the pre-signed WebSocket URL for joining the collaboration room.
 */
export const CollabCreateResponseSchema = z.object({
	/** Pre-signed WebSocket URL for joining the room */
	url: z.string().url(),
	/** Unique room identifier */
	roomId: z.string(),
	/** Unix timestamp when the collaboration link expires */
	expiresAt: z.number(),
});

export type CollabCreateResponse = z.infer<typeof CollabCreateResponseSchema>;

/**
 * GET /personal/:userId error responses.
 *
 * WebSocket messages are defined in protocol/messages.ts.
 *
 * The actual WebSocket is handled by the Durable Object.
 * These are HTTP error responses before upgrade.
 */
export const WsPersonalErrorSchema = z.discriminatedUnion("error", [
	ErrorResponseSchema.extend({
		error: z.literal("upgrade_required"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("missing_token"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("invalid_token"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("forbidden"),
	}),
]);

export type WsPersonalError = z.infer<typeof WsPersonalErrorSchema>;

/**
 * GET /collab/:roomId error responses.
 *
 * WebSocket messages are defined in protocol/messages.ts.
 *
 * The actual WebSocket is handled by the Durable Object.
 * These are HTTP error responses before upgrade.
 */
export const WsCollabErrorSchema = z.discriminatedUnion("error", [
	ErrorResponseSchema.extend({
		error: z.literal("upgrade_required"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("missing_token"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("invalid_token"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("forbidden"),
	}),
	ErrorResponseSchema.extend({
		error: z.literal("expired"),
	}),
]);

export type WsCollabError = z.infer<typeof WsCollabErrorSchema>;

/**
 * Re-export WebSocket message schemas from protocol/messages.ts.
 */
export {
	AgentInfoSchema,
	AgentJoinedSchema,
	AgentLeftSchema,
	AgentStatusChangedSchema,
	AgentStatusSchema,
	AgentsListSchema,
	AuthenticatedSchema,
	CollabAuthenticatedSchema,
	type CollabRoomClientMessage,
	CollabRoomClientMessageSchema,
	type CollabRoomServerMessage,
	CollabRoomServerMessageSchema,
	CollabWebRTCAnswerSchema,
	CollabWebRTCIceSchema,
	CollabWebRTCOfferSchema,
	type CreateCollabRequest,
	CreateCollabRequestSchema,
	ErrorMessageSchema,
	ParticipantJoinedSchema,
	ParticipantLeftSchema,
	ParticipantSchema,
	ParticipantsListSchema,
	type PersonalRoomClientMessage,
	PersonalRoomClientMessageSchema,
	type PersonalRoomServerMessage,
	PersonalRoomServerMessageSchema,
	RegisterAgentSchema,
	SpawnAgentSchema,
	SpawnResultSchema,
	UnregisterAgentSchema,
	WebRTCAnswerSchema,
	WebRTCIceSchema,
	WebRTCOfferSchema,
} from "../protocol/messages";

/**
 * Shipyard JWT claims schema.
 *
 * This is the payload embedded in the JWT returned by /auth/github/callback.
 */
export const ShipyardJWTClaimsSchema = z.object({
	/** Shipyard user ID (internal, derived from GitHub ID) */
	sub: z.string(),
	/** GitHub username */
	ghUser: z.string(),
	/** GitHub user ID */
	ghId: z.number(),
	/** Issued at (Unix timestamp) */
	iat: z.number(),
	/** Expiration (Unix timestamp) */
	exp: z.number(),
	/** Optional: Scope for agent tokens (e.g., 'task:abc123') */
	scope: z.string().optional(),
	/** Optional: Machine ID for agent tokens */
	machineId: z.string().optional(),
});

export type ShipyardJWTClaims = z.infer<typeof ShipyardJWTClaimsSchema>;

/**
 * Pre-signed URL payload schema.
 *
 * Embedded in the token query parameter for /collab/:roomId.
 */
export const PresignedUrlPayloadSchema = z.object({
	/** Room ID this token is valid for */
	roomId: z.string(),
	/** Task ID being collaborated on */
	taskId: z.string(),
	/** User ID of the person who created the invite */
	inviterId: z.string(),
	/** Expiration timestamp (Unix ms) */
	exp: z.number(),
});

export type PresignedUrlPayload = z.infer<typeof PresignedUrlPayloadSchema>;
