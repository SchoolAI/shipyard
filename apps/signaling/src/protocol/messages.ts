/**
 * WebSocket message types with Zod schemas.
 *
 * Re-exports from client/schemas.ts for backwards compatibility.
 * New code should import directly from "../client/schemas".
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
	type CreateCollabResponse,
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
} from "../client/schemas";
