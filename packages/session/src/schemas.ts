/**
 * Zod schemas for all signaling server request/response bodies and WebSocket messages.
 *
 * This module provides:
 * - Validation schemas for all HTTP endpoints
 * - WebSocket message schemas for personal and collab rooms
 * - Inferred TypeScript types for type-safe API usage
 * - Error response schemas for consistent error handling
 *
 * This is the single source of truth for all API schemas.
 * The client directory is designed to be self-contained and hoistable
 * to packages/shared without depending on server code.
 *
 * @module client/schemas
 */

import { z } from 'zod';

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
      })
    )
    .optional(),
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;

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
  status: z.literal('ok'),
  service: z.literal('shipyard-signaling'),
  environment: z.enum(['development', 'production']),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * POST /auth/github/callback request body schema.
 *
 * Used to exchange a GitHub OAuth code for a Shipyard JWT.
 */
export const AuthGitHubCallbackRequestSchema = z.object({
  /** GitHub OAuth authorization code */
  code: z.string().min(1, 'code is required'),
  /** OAuth redirect URI that was used in the authorize request */
  redirect_uri: z.string().url('redirect_uri must be a valid URL'),
});

export type AuthGitHubCallbackRequest = z.infer<typeof AuthGitHubCallbackRequestSchema>;

/**
 * User info returned from successful OAuth.
 */
export const OAuthUserSchema = z.object({
  /** Shipyard user ID ("usr_abc123") */
  id: z.string(),
  /** Display name */
  displayName: z.string(),
  /** GitHub avatar URL */
  avatarUrl: z.string().nullable(),
  /** Linked providers */
  providers: z.array(z.string()),
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

export type AuthGitHubCallbackResponse = z.infer<typeof AuthGitHubCallbackResponseSchema>;

/**
 * GET /auth/verify response schema.
 *
 * Validates a JWT against the database and returns user info or failure reason.
 */
export const AuthVerifyResponseSchema = z.discriminatedUnion('valid', [
  z.object({ valid: z.literal(true), user: OAuthUserSchema }),
  z.object({
    valid: z.literal(false),
    reason: z.enum(['invalid_token', 'user_not_found']),
  }),
]);

export type AuthVerifyResponse = z.infer<typeof AuthVerifyResponseSchema>;

/**
 * POST /collab/create request body schema.
 *
 * Used to create a new collaboration room with a pre-signed URL.
 */
export const CollabCreateRequestSchema = z.object({
  /** ID of the task to collaborate on */
  taskId: z.string().min(1, 'taskId is required'),
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
 * WebSocket messages are defined below.
 *
 * The actual WebSocket is handled by the Durable Object.
 * These are HTTP error responses before upgrade.
 */
export const WsPersonalErrorSchema = z.discriminatedUnion('error', [
  ErrorResponseSchema.extend({
    error: z.literal('upgrade_required'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('missing_token'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('invalid_token'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('forbidden'),
  }),
]);

export type WsPersonalError = z.infer<typeof WsPersonalErrorSchema>;

/**
 * GET /collab/:roomId error responses.
 *
 * WebSocket messages are defined below.
 *
 * The actual WebSocket is handled by the Durable Object.
 * These are HTTP error responses before upgrade.
 */
export const WsCollabErrorSchema = z.discriminatedUnion('error', [
  ErrorResponseSchema.extend({
    error: z.literal('upgrade_required'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('missing_token'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('invalid_token'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('forbidden'),
  }),
  ErrorResponseSchema.extend({
    error: z.literal('expired'),
  }),
]);

export type WsCollabError = z.infer<typeof WsCollabErrorSchema>;

/**
 * Shipyard JWT claims schema.
 *
 * This is the payload embedded in the JWT returned by /auth/github/callback.
 */
export const ShipyardJWTClaimsSchema = z.object({
  /** Shipyard user ID: "usr_abc123" */
  sub: z.string(),
  /** Display name from primary provider */
  displayName: z.string(),
  /** Linked OAuth providers */
  providers: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
  /** Optional: Scope for agent tokens (e.g., 'task:abc123') */
  scope: z.string().optional(),
  /** Optional: Machine ID for daemon tokens */
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

/**
 * Reasoning capability schema for models that support configurable reasoning effort.
 */
export const ReasoningCapabilitySchema = z
  .object({
    efforts: z.array(z.enum(['low', 'medium', 'high'])).min(1),
    defaultEffort: z.enum(['low', 'medium', 'high']),
  })
  .refine((data) => data.efforts.includes(data.defaultEffort), {
    message: 'defaultEffort must be one of the supported efforts',
  });

export type ReasoningCapability = z.infer<typeof ReasoningCapabilitySchema>;

/**
 * Model info schema for machine capabilities.
 */
export const ModelInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  reasoning: ReasoningCapabilitySchema.optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/**
 * Git repo info schema for machine capabilities.
 */
export const GitRepoInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  branch: z.string(),
  remote: z.string().optional(),
});

export type GitRepoInfo = z.infer<typeof GitRepoInfoSchema>;

/**
 * Permission mode schema for machine capabilities.
 */
export const PermissionModeSchema = z.enum(['default', 'accept-edits', 'plan', 'bypass']);

export type PermissionMode = z.infer<typeof PermissionModeSchema>;

/**
 * Machine capabilities schema — advertised by daemons at registration time.
 */
export const MachineCapabilitiesSchema = z.object({
  models: z.array(ModelInfoSchema),
  environments: z.array(GitRepoInfoSchema),
  permissionModes: z.array(PermissionModeSchema),
  homeDir: z.string().optional(),
});

export type MachineCapabilities = z.infer<typeof MachineCapabilitiesSchema>;

/**
 * Register agent message schema for personal room WebSocket.
 * Capabilities are no longer sent via signaling -- they flow through
 * Loro ephemeral on the room document instead.
 */
export const RegisterAgentSchema = z.object({
  type: z.literal('register-agent'),
  agentId: z.string(),
  machineId: z.string(),
  machineName: z.string(),
  agentType: z.string(),
});

/**
 * Unregister agent message schema for personal room WebSocket.
 */
export const UnregisterAgentSchema = z.object({
  type: z.literal('unregister-agent'),
  agentId: z.string(),
});

/**
 * Agent status update message schema for personal room WebSocket.
 */
export const AgentStatusSchema = z.object({
  type: z.literal('agent-status'),
  agentId: z.string(),
  status: z.enum(['idle', 'running', 'error']),
  activeTaskId: z.string().optional(),
});

/**
 * WebRTC offer message schema for personal room WebSocket.
 *
 * When sent by a client: `targetMachineId` is the intended recipient.
 * When relayed by the server: `fromMachineId` is added to identify the sender.
 */
export const WebRTCOfferSchema = z.object({
  type: z.literal('webrtc-offer'),
  targetMachineId: z.string(),
  fromMachineId: z.string().optional(),
  offer: z.unknown(),
  requestId: z.string().optional(),
});

/**
 * WebRTC answer message schema for personal room WebSocket.
 *
 * When sent by a client: `targetMachineId` is the intended recipient.
 * When relayed by the server: `fromMachineId` is added to identify the sender.
 */
export const WebRTCAnswerSchema = z.object({
  type: z.literal('webrtc-answer'),
  targetMachineId: z.string(),
  fromMachineId: z.string().optional(),
  answer: z.unknown(),
  requestId: z.string().optional(),
});

/**
 * WebRTC ICE candidate message schema for personal room WebSocket.
 *
 * When sent by a client: `targetMachineId` is the intended recipient.
 * When relayed by the server: `fromMachineId` is added to identify the sender.
 */
export const WebRTCIceSchema = z.object({
  type: z.literal('webrtc-ice'),
  targetMachineId: z.string(),
  fromMachineId: z.string().optional(),
  candidate: z.unknown(),
});

/**
 * Notify task message schema for personal room WebSocket.
 * Content-free discovery signal — prompt lives in the Loro CRDT, not signaling.
 * Primary use: daemon restart recovery (browser re-sends for active tasks).
 */
export const NotifyTaskSchema = z.object({
  type: z.literal('notify-task'),
  requestId: z.string(),
  machineId: z.string(),
  taskId: z.string(),
});

/**
 * Task acknowledgment message schema for personal room WebSocket.
 */
export const TaskAckSchema = z.object({
  type: z.literal('task-ack'),
  requestId: z.string(),
  taskId: z.string(),
  accepted: z.boolean(),
  error: z.string().optional(),
});

/**
 * Enhance prompt request — browser asks daemon to improve a prompt.
 * Ephemeral: no Loro doc is created or modified.
 */
export const EnhancePromptRequestSchema = z.object({
  type: z.literal('enhance-prompt-request'),
  requestId: z.string(),
  machineId: z.string(),
  prompt: z.string().min(1),
});

export type EnhancePromptRequest = z.infer<typeof EnhancePromptRequestSchema>;

/**
 * Enhance prompt chunk — streamed text fragment from daemon.
 */
export const EnhancePromptChunkSchema = z.object({
  type: z.literal('enhance-prompt-chunk'),
  requestId: z.string(),
  text: z.string(),
});

export type EnhancePromptChunk = z.infer<typeof EnhancePromptChunkSchema>;

/**
 * Enhance prompt done — final result from daemon.
 */
export const EnhancePromptDoneSchema = z.object({
  type: z.literal('enhance-prompt-done'),
  requestId: z.string(),
  fullText: z.string(),
});

export type EnhancePromptDone = z.infer<typeof EnhancePromptDoneSchema>;

/**
 * Error message schema for WebSocket connections.
 */
export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

/**
 * Union of all client-to-server messages for personal room WebSocket.
 */
export const PersonalRoomClientMessageSchema = z.discriminatedUnion('type', [
  RegisterAgentSchema,
  UnregisterAgentSchema,
  AgentStatusSchema,
  WebRTCOfferSchema,
  WebRTCAnswerSchema,
  WebRTCIceSchema,
  NotifyTaskSchema,
  TaskAckSchema,
  EnhancePromptRequestSchema,
  EnhancePromptChunkSchema,
  EnhancePromptDoneSchema,
  ErrorMessageSchema,
]);

export type PersonalRoomClientMessage = z.infer<typeof PersonalRoomClientMessageSchema>;

/**
 * Authentication success message schema for personal room WebSocket.
 */
export const AuthenticatedSchema = z.object({
  type: z.literal('authenticated'),
  userId: z.string(),
  username: z.string(),
});

/**
 * Agent info schema for personal room WebSocket.
 * Capabilities are no longer included -- they flow through Loro ephemeral.
 */
export const AgentInfoSchema = z.object({
  agentId: z.string(),
  machineId: z.string(),
  machineName: z.string(),
  agentType: z.string(),
  status: z.enum(['idle', 'running', 'error']),
  activeTaskId: z.string().optional(),
});

export type AgentInfo = z.infer<typeof AgentInfoSchema>;

/**
 * Agents list message schema for personal room WebSocket.
 */
export const AgentsListSchema = z.object({
  type: z.literal('agents-list'),
  agents: z.array(AgentInfoSchema),
});

/**
 * Agent joined notification message schema for personal room WebSocket.
 */
export const AgentJoinedSchema = z.object({
  type: z.literal('agent-joined'),
  agent: AgentInfoSchema,
});

/**
 * Agent left notification message schema for personal room WebSocket.
 */
export const AgentLeftSchema = z.object({
  type: z.literal('agent-left'),
  agentId: z.string(),
});

/**
 * Agent status changed notification message schema for personal room WebSocket.
 */
export const AgentStatusChangedSchema = z.object({
  type: z.literal('agent-status-changed'),
  agentId: z.string(),
  status: z.enum(['idle', 'running', 'error']),
  activeTaskId: z.string().optional(),
});

/**
 * Union of all server-to-client messages for personal room WebSocket.
 */
export const PersonalRoomServerMessageSchema = z.discriminatedUnion('type', [
  AuthenticatedSchema,
  AgentsListSchema,
  AgentJoinedSchema,
  AgentLeftSchema,
  AgentStatusChangedSchema,
  NotifyTaskSchema,
  TaskAckSchema,
  ErrorMessageSchema,
  WebRTCOfferSchema,
  WebRTCAnswerSchema,
  WebRTCIceSchema,
  EnhancePromptRequestSchema,
  EnhancePromptChunkSchema,
  EnhancePromptDoneSchema,
]);

export type PersonalRoomServerMessage = z.infer<typeof PersonalRoomServerMessageSchema>;

/**
 * WebRTC offer message schema for collab room WebSocket.
 */
export const CollabWebRTCOfferSchema = z.object({
  type: z.literal('webrtc-offer'),
  targetUserId: z.string(),
  offer: z.unknown(),
});

/**
 * WebRTC answer message schema for collab room WebSocket.
 */
export const CollabWebRTCAnswerSchema = z.object({
  type: z.literal('webrtc-answer'),
  targetUserId: z.string(),
  answer: z.unknown(),
});

/**
 * WebRTC ICE candidate message schema for collab room WebSocket.
 */
export const CollabWebRTCIceSchema = z.object({
  type: z.literal('webrtc-ice'),
  targetUserId: z.string(),
  candidate: z.unknown(),
});

/**
 * Union of all client-to-server messages for collab room WebSocket.
 */
export const CollabRoomClientMessageSchema = z.discriminatedUnion('type', [
  CollabWebRTCOfferSchema,
  CollabWebRTCAnswerSchema,
  CollabWebRTCIceSchema,
]);

export type CollabRoomClientMessage = z.infer<typeof CollabRoomClientMessageSchema>;

/**
 * Participant info schema for collab room WebSocket.
 */
export const ParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: z.enum(['owner', 'collaborator']),
});

/**
 * Authentication success message schema for collab room WebSocket.
 */
export const CollabAuthenticatedSchema = z.object({
  type: z.literal('authenticated'),
  userId: z.string(),
  username: z.string(),
  taskId: z.string(),
});

/**
 * Participants list message schema for collab room WebSocket.
 */
export const ParticipantsListSchema = z.object({
  type: z.literal('participants-list'),
  participants: z.array(ParticipantSchema),
});

/**
 * Participant joined notification message schema for collab room WebSocket.
 */
export const ParticipantJoinedSchema = z.object({
  type: z.literal('participant-joined'),
  participant: ParticipantSchema,
});

/**
 * Participant left notification message schema for collab room WebSocket.
 */
export const ParticipantLeftSchema = z.object({
  type: z.literal('participant-left'),
  userId: z.string(),
});

/**
 * Union of all server-to-client messages for collab room WebSocket.
 */
export const CollabRoomServerMessageSchema = z.discriminatedUnion('type', [
  CollabAuthenticatedSchema,
  ParticipantsListSchema,
  ParticipantJoinedSchema,
  ParticipantLeftSchema,
  ErrorMessageSchema,
  CollabWebRTCOfferSchema,
  CollabWebRTCAnswerSchema,
  CollabWebRTCIceSchema,
]);

export type CollabRoomServerMessage = z.infer<typeof CollabRoomServerMessageSchema>;

/** POST /auth/device/start — no request body needed */
export const DeviceStartResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string().url(),
  expiresIn: z.number(),
  interval: z.number(),
});
export type DeviceStartResponse = z.infer<typeof DeviceStartResponseSchema>;

/** POST /auth/device/poll request */
export const DevicePollRequestSchema = z.object({
  deviceCode: z.string().min(1, 'deviceCode is required'),
});
export type DevicePollRequest = z.infer<typeof DevicePollRequestSchema>;

/** POST /auth/device/poll response (success) */
export const DevicePollResponseSchema = z.object({
  token: z.string(),
  user: OAuthUserSchema,
});
export type DevicePollResponse = z.infer<typeof DevicePollResponseSchema>;

/** POST /auth/device/poll response (pending/errors) */
export const DevicePollPendingSchema = z.object({
  error: z.enum(['authorization_pending', 'slow_down', 'expired_token']),
});
export type DevicePollPending = z.infer<typeof DevicePollPendingSchema>;
