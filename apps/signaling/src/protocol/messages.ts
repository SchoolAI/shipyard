/**
 * WebSocket message types with Zod schemas.
 */

import { z } from "zod";

// ============ Personal Room Messages (Client → Server) ============

export const RegisterAgentSchema = z.object({
	type: z.literal("register-agent"),
	agentId: z.string(),
	machineId: z.string(),
	machineName: z.string(),
	agentType: z.string(),
});

export const UnregisterAgentSchema = z.object({
	type: z.literal("unregister-agent"),
	agentId: z.string(),
});

export const AgentStatusSchema = z.object({
	type: z.literal("agent-status"),
	agentId: z.string(),
	status: z.enum(["idle", "running", "error"]),
	activeTaskId: z.string().optional(),
});

export const WebRTCOfferSchema = z.object({
	type: z.literal("webrtc-offer"),
	targetMachineId: z.string(),
	offer: z.unknown(), // RTCSessionDescriptionInit
	requestId: z.string().optional(),
});

export const WebRTCAnswerSchema = z.object({
	type: z.literal("webrtc-answer"),
	targetMachineId: z.string(),
	answer: z.unknown(), // RTCSessionDescriptionInit
	requestId: z.string().optional(),
});

export const WebRTCIceSchema = z.object({
	type: z.literal("webrtc-ice"),
	targetMachineId: z.string(),
	candidate: z.unknown(), // RTCIceCandidateInit
});

export const SpawnAgentSchema = z.object({
	type: z.literal("spawn-agent"),
	requestId: z.string(),
	machineId: z.string(),
	taskId: z.string(),
	prompt: z.string(),
	cwd: z.string().optional(),
});

export const PersonalRoomClientMessageSchema = z.discriminatedUnion("type", [
	RegisterAgentSchema,
	UnregisterAgentSchema,
	AgentStatusSchema,
	WebRTCOfferSchema,
	WebRTCAnswerSchema,
	WebRTCIceSchema,
	SpawnAgentSchema,
]);

export type PersonalRoomClientMessage = z.infer<
	typeof PersonalRoomClientMessageSchema
>;

// ============ Personal Room Messages (Server → Client) ============

export const AuthenticatedSchema = z.object({
	type: z.literal("authenticated"),
	userId: z.string(),
	username: z.string(),
});

export const AgentInfoSchema = z.object({
	agentId: z.string(),
	machineId: z.string(),
	machineName: z.string(),
	agentType: z.string(),
	status: z.enum(["idle", "running", "error"]),
	activeTaskId: z.string().optional(),
});

export const AgentsListSchema = z.object({
	type: z.literal("agents-list"),
	agents: z.array(AgentInfoSchema),
});

export const AgentJoinedSchema = z.object({
	type: z.literal("agent-joined"),
	agent: AgentInfoSchema,
});

export const AgentLeftSchema = z.object({
	type: z.literal("agent-left"),
	agentId: z.string(),
});

export const AgentStatusChangedSchema = z.object({
	type: z.literal("agent-status-changed"),
	agentId: z.string(),
	status: z.enum(["idle", "running", "error"]),
	activeTaskId: z.string().optional(),
});

export const SpawnResultSchema = z.object({
	type: z.literal("spawn-result"),
	requestId: z.string(),
	taskId: z.string(),
	success: z.boolean(),
	error: z.string().optional(),
});

export const ErrorMessageSchema = z.object({
	type: z.literal("error"),
	code: z.string(),
	message: z.string(),
	requestId: z.string().optional(),
});

export const PersonalRoomServerMessageSchema = z.discriminatedUnion("type", [
	AuthenticatedSchema,
	AgentsListSchema,
	AgentJoinedSchema,
	AgentLeftSchema,
	AgentStatusChangedSchema,
	SpawnResultSchema,
	ErrorMessageSchema,
	WebRTCOfferSchema, // Relayed
	WebRTCAnswerSchema, // Relayed
	WebRTCIceSchema, // Relayed
]);

export type PersonalRoomServerMessage = z.infer<
	typeof PersonalRoomServerMessageSchema
>;

// ============ Collab Room Messages (Client → Server) ============

export const CollabWebRTCOfferSchema = z.object({
	type: z.literal("webrtc-offer"),
	targetUserId: z.string(),
	offer: z.unknown(),
});

export const CollabWebRTCAnswerSchema = z.object({
	type: z.literal("webrtc-answer"),
	targetUserId: z.string(),
	answer: z.unknown(),
});

export const CollabWebRTCIceSchema = z.object({
	type: z.literal("webrtc-ice"),
	targetUserId: z.string(),
	candidate: z.unknown(),
});

export const CollabRoomClientMessageSchema = z.discriminatedUnion("type", [
	CollabWebRTCOfferSchema,
	CollabWebRTCAnswerSchema,
	CollabWebRTCIceSchema,
]);

export type CollabRoomClientMessage = z.infer<
	typeof CollabRoomClientMessageSchema
>;

// ============ Collab Room Messages (Server → Client) ============

export const ParticipantSchema = z.object({
	userId: z.string(),
	username: z.string(),
	role: z.enum(["owner", "collaborator"]),
});

export const CollabAuthenticatedSchema = z.object({
	type: z.literal("authenticated"),
	userId: z.string(),
	username: z.string(),
	taskId: z.string(),
});

export const ParticipantsListSchema = z.object({
	type: z.literal("participants-list"),
	participants: z.array(ParticipantSchema),
});

export const ParticipantJoinedSchema = z.object({
	type: z.literal("participant-joined"),
	participant: ParticipantSchema,
});

export const ParticipantLeftSchema = z.object({
	type: z.literal("participant-left"),
	userId: z.string(),
});

export const CollabRoomServerMessageSchema = z.discriminatedUnion("type", [
	CollabAuthenticatedSchema,
	ParticipantsListSchema,
	ParticipantJoinedSchema,
	ParticipantLeftSchema,
	ErrorMessageSchema,
	CollabWebRTCOfferSchema, // Relayed
	CollabWebRTCAnswerSchema, // Relayed
	CollabWebRTCIceSchema, // Relayed
]);

export type CollabRoomServerMessage = z.infer<
	typeof CollabRoomServerMessageSchema
>;

// ============ HTTP Request/Response Types ============

export const CreateCollabRequestSchema = z.object({
	taskId: z.string().min(1),
	expiresInMinutes: z.number().min(1).max(1440).default(60), // 1 min to 24 hours
});

export type CreateCollabRequest = z.infer<typeof CreateCollabRequestSchema>;

export interface CreateCollabResponse {
	url: string;
	roomId: string;
	expiresAt: number;
}
