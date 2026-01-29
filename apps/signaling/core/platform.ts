/**
 * Platform abstraction interface for signaling server implementations.
 *
 * This interface abstracts over the differences between Node.js and Cloudflare
 * environments, allowing core handlers to work with both platforms.
 *
 * Simplified for basic pub/sub signaling - no approval or queueing.
 */

import type { InviteRedemption, InviteToken } from '@shipyard/schema';

/**
 * Platform-specific adapter that core handlers use to interact with
 * storage, crypto, WebSocket connections, pub/sub topics, and logging.
 */
export interface PlatformAdapter {
  /*
   * --- Storage Operations ---
   * For invite tokens and redemptions only (approval state removed).
   */

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
   * Get invite redemption by user (checks if user redeemed ANY token for this plan).
   * Key format: 'redemption:{planId}:{userId}'
   * Returns undefined if no redemption exists.
   * @deprecated Use getSpecificInviteRedemption for token-specific checks
   */
  getInviteRedemption(planId: string, userId: string): Promise<InviteRedemption | undefined>;

  /**
   * Get invite redemption for a specific token and user.
   * Key format: 'redemption:{planId}:{tokenId}:{userId}'
   * Returns undefined if this specific token hasn't been redeemed by this user.
   */
  getSpecificInviteRedemption(
    planId: string,
    tokenId: string,
    userId: string
  ): Promise<InviteRedemption | undefined>;

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

  /*
   * --- Crypto Operations ---
   * All crypto operations are async to support Web Crypto API (Cloudflare).
   * Node.js can use sync crypto functions but wrap in Promise.resolve().
   */

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

  /*
   * --- WebSocket Operations ---
   * WebSocket type is unknown because each platform uses different types:
   * - Node.js: import('ws').WebSocket
   * - Cloudflare: WebSocket (global)
   */

  /**
   * Send a JSON message to a WebSocket connection.
   * Serializes the message and sends it as text.
   */
  sendMessage(ws: unknown, message: unknown): void;

  /*
   * --- Topic (Pub/Sub) Operations ---
   * Topics represent WebRTC rooms (plan IDs). Clients subscribe to topics
   * to receive signaling messages for that room.
   *
   * Two-message authentication pattern:
   * 1. subscribe message -> adds to PENDING (no data access)
   * 2. authenticate message -> validates, then activates subscription
   * 3. Only ACTIVATED subscriptions can publish/receive data
   */

  /**
   * Get all WebSocket connections subscribed to a topic.
   * Returns empty array if topic has no subscribers.
   * NOTE: Only returns ACTIVATED subscribers, not pending ones.
   */
  getTopicSubscribers(topic: string): unknown[];

  /**
   * Subscribe a WebSocket connection to a topic.
   * Connection will receive all messages published to this topic.
   * @deprecated Use addPendingSubscription + activatePendingSubscription for new code
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

  /*
   * --- Pending Subscription Management (Two-Message Auth) ---
   * Subscriptions start as "pending" and must be authenticated before activation.
   */

  /**
   * Add a pending subscription for a WebSocket connection.
   * Pending subscriptions cannot publish or receive data.
   */
  addPendingSubscription(ws: unknown, topic: string): void;

  /**
   * Get all pending subscriptions for a WebSocket connection.
   * Returns empty array if no pending subscriptions.
   */
  getPendingSubscriptions(ws: unknown): string[];

  /**
   * Activate a pending subscription after successful authentication.
   * Moves subscription from pending to active, allowing data flow.
   * Returns true if subscription was pending and is now active.
   */
  activatePendingSubscription(ws: unknown, topic: string): boolean;

  /**
   * Check if a subscription is pending (not yet authenticated).
   */
  isSubscriptionPending(ws: unknown, topic: string): boolean;

  /**
   * Check if a subscription is active (authenticated and can send/receive data).
   */
  isSubscriptionActive(ws: unknown, topic: string): boolean;

  /**
   * Set authentication deadline for a connection.
   * Connection should be closed if auth is not received by deadline.
   */
  setAuthDeadline(ws: unknown, timestamp: number): void;

  /**
   * Clear authentication deadline for a connection.
   * Called after successful authentication.
   */
  clearAuthDeadline(ws: unknown): void;

  /**
   * Get authentication deadline for a connection.
   * Returns null if no deadline set.
   */
  getAuthDeadline(ws: unknown): number | null;

  /**
   * Get all connections that have auth deadlines set.
   * Used by the timeout enforcement mechanism to check for expired connections.
   * Returns array of objects with ws and deadline timestamp.
   */
  getAllConnectionsWithDeadlines(): Array<{ ws: unknown; deadline: number }>;

  /**
   * Set the user ID for a connection.
   * Called after successful authentication.
   */
  setConnectionUserId(ws: unknown, userId: string): void;

  /**
   * Get the user ID for a connection.
   * Returns null if not authenticated.
   */
  getConnectionUserId(ws: unknown): string | null;

  /*
   * --- Authentication Operations ---
   * For validating user identity and plan ownership.
   */

  /**
   * Validate a GitHub OAuth token and return the authenticated username.
   * Calls GitHub API /user endpoint to verify the token.
   *
   * @param token - GitHub OAuth token to validate
   * @returns Object with valid flag and username if successful, error message if not
   */
  validateGitHubToken(
    token: string
  ): Promise<{ valid: boolean; username?: string; error?: string }>;

  /**
   * Get the owner ID for a plan.
   * Returns null if plan ownership is not recorded.
   *
   * Plan ownership is recorded on first invite creation (trust-on-first-use).
   * This prevents attackers from claiming ownership of existing plans.
   *
   * @param planId - The plan ID to look up
   * @returns The owner's GitHub username, or null if not recorded
   */
  getPlanOwnerId(planId: string): Promise<string | null>;

  /**
   * Set the owner ID for a plan.
   * Used on first invite creation to record plan ownership.
   *
   * @param planId - The plan ID
   * @param ownerId - The owner's GitHub username
   */
  setPlanOwnerId(planId: string, ownerId: string): Promise<void>;

  /*
   * --- Logging ---
   * Simple logging interface. Implementations can use console, Durable Object
   * ctx.waitUntil(), or other platform-specific mechanisms.
   */

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
