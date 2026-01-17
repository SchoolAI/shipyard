/**
 * Platform abstraction interface for signaling server implementations.
 *
 * This interface abstracts over the differences between Node.js and Cloudflare
 * environments, allowing core handlers to work with both platforms.
 *
 * Why async everywhere:
 * - Storage operations are async in Cloudflare Durable Objects
 * - Crypto operations use Web Crypto API (async) in Cloudflare
 * - Node.js can return resolved Promises for synchronous operations
 */

import type { InviteRedemption, InviteToken } from '@peer-plan/schema';
import type { PlanApprovalState } from './types.js';

/**
 * Platform-specific adapter that core handlers use to interact with
 * storage, crypto, WebSocket connections, pub/sub topics, and logging.
 */
export interface PlatformAdapter {
  // --- Storage Operations ---
  // All storage operations are async to support both sync (Node.js Map)
  // and async (Cloudflare Durable Objects) implementations.

  /**
   * Get approval state for a plan.
   * Returns undefined if no approval state exists.
   */
  getApprovalState(planId: string): Promise<PlanApprovalState | undefined>;

  /**
   * Set approval state for a plan.
   * Overwrites any existing state.
   */
  setApprovalState(planId: string, state: PlanApprovalState): Promise<void>;

  /**
   * Get invite token by plan ID and token ID.
   * Returns undefined if token doesn't exist.
   * Key format: 'invite:{planId}:{tokenId}'
   */
  getInviteToken(planId: string, tokenId: string): Promise<InviteToken | undefined>;

  /**
   * Set invite token.
   * Key format: 'invite:{planId}:{tokenId}'
   */
  setInviteToken(planId: string, tokenId: string, token: InviteToken): Promise<void>;

  /**
   * Delete invite token.
   * Used when revoking tokens.
   * Key format: 'invite:{planId}:{tokenId}'
   */
  deleteInviteToken(planId: string, tokenId: string): Promise<void>;

  /**
   * List all invite tokens for a plan.
   * Used when listing active invites.
   */
  listInviteTokens(planId: string): Promise<InviteToken[]>;

  /**
   * Get invite redemption by key.
   * Key format: 'redemption:{planId}:{userId}'
   * Returns undefined if no redemption exists.
   */
  getInviteRedemption(planId: string, userId: string): Promise<InviteRedemption | undefined>;

  /**
   * Set invite redemption.
   * Key format: 'redemption:{planId}:{tokenId}:{userId}'
   * Tracks which user redeemed which specific token (allows multiple tokens per user).
   */
  setInviteRedemption(
    planId: string,
    tokenId: string,
    userId: string,
    redemption: InviteRedemption
  ): Promise<void>;

  // --- Crypto Operations ---
  // All crypto operations are async to support Web Crypto API (Cloudflare).
  // Node.js can use sync crypto functions but wrap in Promise.resolve().

  /**
   * Generate a random token ID (8 characters).
   * Used for creating invite tokens.
   */
  generateTokenId(): Promise<string>;

  /**
   * Generate a random token value (32 bytes, base64url encoded).
   * This is the secret part of the token that users share.
   */
  generateTokenValue(): Promise<string>;

  /**
   * Hash a token value using SHA-256.
   * Returns hex-encoded hash for storage/comparison.
   *
   * Why hash: We never store raw token values, only hashes.
   * When verifying, we hash the provided value and compare.
   */
  hashTokenValue(value: string): Promise<string>;

  /**
   * Verify that a token value matches a stored hash.
   * Timing-safe comparison to prevent timing attacks.
   */
  verifyTokenHash(value: string, hash: string): Promise<boolean>;

  // --- WebSocket Operations ---
  // WebSocket type is unknown because each platform uses different types:
  // - Node.js: import('ws').WebSocket
  // - Cloudflare: WebSocket (global)

  /**
   * Send a JSON message to a WebSocket connection.
   * Serializes the message and sends it as text.
   */
  sendMessage(ws: unknown, message: unknown): void;

  /**
   * Get the userId associated with a WebSocket connection.
   * Returns undefined if no userId has been set.
   *
   * Why needed: Tracks which GitHub user is connected for approval checks.
   */
  getUserId(ws: unknown): string | undefined;

  /**
   * Set the userId for a WebSocket connection.
   * Called when client subscribes with a userId.
   *
   * Why needed: Associates connection with GitHub user for approval checks.
   */
  setUserId(ws: unknown, userId: string | undefined): void;

  // --- Topic (Pub/Sub) Operations ---
  // Topics represent WebRTC rooms (plan IDs). Clients subscribe to topics
  // to receive signaling messages for that room.

  /**
   * Get all WebSocket connections subscribed to a topic.
   * Returns empty array if topic has no subscribers.
   */
  getTopicSubscribers(topic: string): unknown[];

  /**
   * Subscribe a WebSocket connection to a topic.
   * Connection will receive all messages published to this topic.
   */
  subscribeToTopic(ws: unknown, topic: string): void;

  /**
   * Unsubscribe a WebSocket connection from a topic.
   * Connection will no longer receive messages for this topic.
   */
  unsubscribeFromTopic(ws: unknown, topic: string): void;

  /**
   * Unsubscribe a WebSocket connection from all topics.
   * Called when connection closes.
   */
  unsubscribeFromAllTopics(ws: unknown): void;

  // --- Logging ---
  // Simple logging interface. Implementations can use console, Durable Object
  // ctx.waitUntil(), or other platform-specific mechanisms.

  /**
   * Log informational message.
   */
  info(message: string, ...args: unknown[]): void;

  /**
   * Log warning message.
   */
  warn(message: string, ...args: unknown[]): void;

  /**
   * Log error message.
   */
  error(message: string, ...args: unknown[]): void;

  /**
   * Log debug message.
   * May be no-op in production.
   */
  debug(message: string, ...args: unknown[]): void;
}
