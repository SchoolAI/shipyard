/**
 * Shared message types for signaling server implementations.
 *
 * This module consolidates all message type definitions used by both:
 * - Node.js WebSocket server (apps/signaling/src/server.ts)
 * - Cloudflare Durable Objects server (apps/signaling/cloudflare/src/signaling.ts)
 *
 * By centralizing these types, we ensure consistency across implementations
 * and avoid duplication.
 */

// Import and re-export types from @peer-plan/schema that are used in signaling
import type {
  CreateInviteRequest,
  InviteCreatedResponse,
  InviteRedeemedNotification,
  InviteRedemption,
  InviteRedemptionResult,
  InviteRevokedResponse,
  InvitesListResponse,
  InviteToken,
  ListInvitesRequest,
  RedeemInviteRequest,
  RevokeInviteRequest,
} from '@peer-plan/schema';

export type {
  CreateInviteRequest,
  InviteCreatedResponse,
  InviteRedeemedNotification,
  InviteRedemption,
  InviteRedemptionResult,
  InviteRevokedResponse,
  InvitesListResponse,
  InviteToken,
  ListInvitesRequest,
  RedeemInviteRequest,
  RevokeInviteRequest,
};

// --- Core Signaling Protocol Messages (y-webrtc) ---

/**
 * Client subscribes to room topics (plan IDs).
 * Clients can optionally provide their userId for approval checking.
 */
export interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
  userId?: string; // GitHub username for approval checking
}

/**
 * Client unsubscribes from room topics.
 */
export interface UnsubscribeMessage {
  type: 'unsubscribe';
  topics: string[];
}

/**
 * Publish message to broadcast to all subscribers of a topic.
 * This is the main signaling message for WebRTC offer/answer/ICE.
 */
export interface PublishMessage {
  type: 'publish';
  topic: string;
  from?: string; // y-webrtc client ID (not user ID)
  clients?: number; // Number of clients in the room (added by server)
  [key: string]: unknown; // y-webrtc adds various fields (to, signal, etc.)
}

/**
 * Ping message for keepalive.
 */
export interface PingMessage {
  type: 'ping';
}

/**
 * Pong response to ping message.
 */
export interface PongMessage {
  type: 'pong';
}

/**
 * Approval state message from plan owner.
 * Used to broadcast approval state to the signaling server.
 */
export interface ApprovalStateMessage {
  type: 'approval_state';
  planId: string;
  ownerId: string;
  approvedUsers: string[];
  rejectedUsers: string[];
}

/**
 * Error message sent to clients when something goes wrong.
 */
export interface ErrorMessage {
  type: 'error';
  error: string;
}

/**
 * Plan approval state stored by the signaling server.
 * Tracks which users are approved or rejected for a plan.
 */
export interface PlanApprovalState {
  planId: string;
  ownerId: string;
  approvedUsers: string[];
  rejectedUsers: string[];
  lastUpdated: number;
}

// --- Type Unions ---

/**
 * Discriminated union of all incoming signaling message types.
 * These are messages that clients send to the server.
 */
export type SignalingMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | PublishMessage
  | PingMessage
  | ApprovalStateMessage
  | CreateInviteRequest
  | RedeemInviteRequest
  | RevokeInviteRequest
  | ListInvitesRequest;

/**
 * All possible outgoing message types.
 * These are messages that the server sends to clients.
 */
export type OutgoingMessage =
  | PublishMessage
  | PongMessage
  | ErrorMessage
  | InviteCreatedResponse
  | InviteRedemptionResult
  | InviteRevokedResponse
  | InvitesListResponse
  | InviteRedeemedNotification;

/**
 * Token validation error types.
 */
export type TokenValidationError = 'invalid' | 'revoked' | 'expired' | 'exhausted';
