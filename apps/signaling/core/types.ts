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

/** Import and re-export types from @shipyard/schema that are used in signaling */
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
import { z } from 'zod';

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

/** --- Authentication Messages (Two-Message Pattern) --- */

/**
 * Authentication message sent after subscribe.
 * Browser sends this immediately after y-webrtc's subscribe message.
 */
export type AuthenticateMessage =
  | {
      type: 'authenticate';
      auth: 'owner';
      userId: string;
      githubToken: string;
    }
  | {
      type: 'authenticate';
      auth: 'invite';
      userId: string;
      inviteToken: { tokenId: string; tokenValue: string };
    };

/**
 * Successful authentication response.
 */
export interface AuthenticatedResponse {
  type: 'authenticated';
  userId: string;
  planId: string;
}

/**
 * Authentication error types.
 */
export type AuthErrorType =
  | 'invalid_token'
  | 'unauthorized'
  | 'timeout'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'exhausted'
  | 'no_pending_subscription';

/**
 * Authentication error response.
 */
export interface AuthErrorResponse {
  type: 'auth_error';
  error: AuthErrorType;
  message: string;
}

/** --- Core Signaling Protocol Messages (y-webrtc) --- */

/**
 * Client subscribes to room topics (plan IDs).
 */
export interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
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
  from?: string /** y-webrtc client ID (not user ID) */;
  clients?: number /** Number of clients in the room (added by server) */;
  [key: string]: unknown /** y-webrtc adds various fields (to, signal, etc.) */;
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

/** --- Type Unions --- */

/**
 * Discriminated union of all incoming signaling message types.
 * These are messages that clients send to the server.
 */
export type SignalingMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | PublishMessage
  | PingMessage
  | AuthenticateMessage
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
  | AuthenticatedResponse
  | AuthErrorResponse
  | InviteCreatedResponse
  | InviteRedemptionResult
  | InviteRevokedResponse
  | InvitesListResponse
  | InviteRedeemedNotification;

/**
 * Token validation error types.
 */
export type TokenValidationError = 'invalid' | 'revoked' | 'expired' | 'exhausted';

/** --- Zod Schemas for runtime validation --- */

const SubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  topics: z.array(z.string()),
});

const UnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  topics: z.array(z.string()),
});

const PublishMessageSchema = z
  .object({
    type: z.literal('publish'),
    topic: z.string(),
    from: z.string().optional(),
    clients: z.number().optional(),
  })
  .passthrough();

const PingMessageSchema = z.object({
  type: z.literal('ping'),
});

const CreateInviteRequestSchema = z.object({
  type: z.literal('create_invite'),
  planId: z.string(),
  authToken: z.string(),
  ttlMinutes: z.number().optional(),
  maxUses: z.number().nullable().optional(),
  label: z.string().optional(),
});

const RedeemInviteRequestSchema = z.object({
  type: z.literal('redeem_invite'),
  planId: z.string(),
  tokenId: z.string(),
  tokenValue: z.string(),
  userId: z.string(),
});

const RevokeInviteRequestSchema = z.object({
  type: z.literal('revoke_invite'),
  planId: z.string(),
  tokenId: z.string(),
  authToken: z.string(),
});

const ListInvitesRequestSchema = z.object({
  type: z.literal('list_invites'),
  planId: z.string(),
  authToken: z.string(),
});

/** Authenticate message schemas (discriminated union on 'auth' field) */
const AuthenticateOwnerSchema = z.object({
  type: z.literal('authenticate'),
  auth: z.literal('owner'),
  userId: z.string(),
  githubToken: z.string(),
});

const AuthenticateInviteSchema = z.object({
  type: z.literal('authenticate'),
  auth: z.literal('invite'),
  userId: z.string(),
  inviteToken: z.object({
    tokenId: z.string(),
    tokenValue: z.string(),
  }),
});

/**
 * Schema for authenticate messages.
 * Uses a union since z.discriminatedUnion requires different type values.
 */
export const AuthenticateMessageSchema = z.union([
  AuthenticateOwnerSchema,
  AuthenticateInviteSchema,
]);

/**
 * Zod schema for validating incoming signaling messages.
 * Use this to safely parse external JSON data.
 */
export const SignalingMessageSchema = z.discriminatedUnion('type', [
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  PublishMessageSchema,
  PingMessageSchema,
  CreateInviteRequestSchema,
  RedeemInviteRequestSchema,
  RevokeInviteRequestSchema,
  ListInvitesRequestSchema,
  /** Authenticate uses special schema since it has nested discriminator on 'auth' */
  z
    .object({ type: z.literal('authenticate') })
    .passthrough(),
]);
