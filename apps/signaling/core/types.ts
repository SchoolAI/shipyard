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

// Import and re-export types from @shipyard/schema that are used in signaling
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
} from '@shipyard/schema';

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
 *
 * For plan rooms, authentication is required:
 * - inviteToken: Required for non-owners to join plan rooms
 * - userId: GitHub username of the connecting user
 */
export interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
  /** Invite token for authenticated room access */
  inviteToken?: {
    tokenId: string;
    tokenValue: string;
  };
  /** GitHub username of the connecting user */
  userId?: string;
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
 * Error message sent to clients when something goes wrong.
 */
export interface ErrorMessage {
  type: 'error';
  /** Error code for programmatic handling */
  error: string;
  /** Human-readable error message */
  message?: string;
}

/**
 * Authentication/authorization error types for invite operations.
 */
export type InviteAuthError = 'unauthenticated' | 'unauthorized' | 'plan_not_found';

// --- Approval Flow Messages ---

/**
 * Approval status for a user in a plan room.
 * - pending: User has valid token but awaiting owner approval
 * - approved: User can receive full CRDT content
 * - rejected: User is denied access
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Owner approves a pending user for full access.
 */
export interface ApproveUserRequest {
  type: 'approve_user';
  planId: string;
  userId: string;
  /** Owner's GitHub OAuth token for authentication */
  authToken: string;
}

/**
 * Owner rejects a pending user, denying access.
 */
export interface RejectUserRequest {
  type: 'reject_user';
  planId: string;
  userId: string;
  /** Owner's GitHub OAuth token for authentication */
  authToken: string;
}

/**
 * Server notifies a user of their approval status change.
 */
export interface ApprovalStatusNotification {
  type: 'approval_status';
  planId: string;
  userId: string;
  status: ApprovalStatus;
}

/**
 * Server notifies owner of users waiting for approval.
 */
export interface PendingUsersNotification {
  type: 'pending_users';
  planId: string;
  users: Array<{ userId: string; requestedAt: number }>;
}

/**
 * Server notifies owner when a new user requests access.
 */
export interface PendingUserNotification {
  type: 'pending_user';
  planId: string;
  userId: string;
  requestedAt: number;
}

/**
 * Server confirms user was approved.
 */
export interface UserApprovedResponse {
  type: 'user_approved';
  planId: string;
  userId: string;
}

/**
 * Server confirms user was rejected.
 */
export interface UserRejectedResponse {
  type: 'user_rejected';
  planId: string;
  userId: string;
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
  | CreateInviteRequest
  | RedeemInviteRequest
  | RevokeInviteRequest
  | ListInvitesRequest
  | ApproveUserRequest
  | RejectUserRequest;

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
  | InviteRedeemedNotification
  | ApprovalStatusNotification
  | PendingUsersNotification
  | PendingUserNotification
  | UserApprovedResponse
  | UserRejectedResponse;

/**
 * Token validation error types.
 */
export type TokenValidationError = 'invalid' | 'revoked' | 'expired' | 'exhausted';
