/**
 * Node.js implementation of PlatformAdapter.
 *
 * This adapter wraps Node.js-specific functionality (ws WebSockets, node:crypto,
 * in-memory Maps) into the platform-agnostic interface that core handlers use.
 *
 * Storage: Uses in-memory Maps (suitable for single-process development server)
 * Crypto: Uses node:crypto (synchronous, wrapped in Promise.resolve())
 * WebSocket: Uses ws library types
 * Logging: Uses pino logger
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { InviteRedemption, InviteToken } from '@shipyard/schema';
import { nanoid } from 'nanoid';
import type { WebSocket } from 'ws';
import type { PlatformAdapter } from '../core/platform.js';
import type { PlanApprovalState } from '../core/types.js';
import { logger } from '../src/logger.js';

/**
 * Node.js platform adapter implementation.
 *
 * Uses in-memory Maps for storage (suitable for single-process dev server).
 * In production, consider using Redis or another persistent store.
 */
export class NodePlatformAdapter implements PlatformAdapter {
  // --- Storage Maps ---

  /**
   * Plan approval state storage (planId -> approval state).
   */
  private planApprovals = new Map<string, PlanApprovalState>();

  /**
   * Invite tokens storage (planId:tokenId -> token).
   * Uses composite key for efficient per-plan lookups.
   */
  private inviteTokens = new Map<string, InviteToken>();

  /**
   * Invite redemptions ("planId:tokenId:userId" -> redemption).
   */
  private redemptions = new Map<string, InviteRedemption>();

  /**
   * Connection user IDs (conn -> userId).
   * Uses WeakMap to allow garbage collection when connection closes.
   */
  private connectionUserIds = new WeakMap<WebSocket, string>();

  /**
   * Map from topic-name to set of subscribed clients.
   */
  private topics = new Map<string, Set<WebSocket>>();

  /**
   * Map from connection to set of subscribed topics.
   * Used for efficient cleanup when connection closes.
   */
  private connectionTopics = new WeakMap<WebSocket, Set<string>>();

  /**
   * Queued message with timestamp for TTL expiration.
   */
  private static readonly MESSAGE_QUEUE_TTL_MS = 30_000; // 30 seconds

  /**
   * Map from connection to queued messages (by topic).
   * Used to buffer messages for connections without userId.
   * Structure: ws -> Map<topic, QueuedMessage[]>
   */
  private connectionMessageQueues = new WeakMap<
    WebSocket,
    Map<string, Array<{ message: unknown; queuedAt: number }>>
  >();

  /**
   * Set of connections currently flushing their message queues.
   * Prevents race conditions between flush and concurrent publish operations.
   */
  private flushingConnections = new WeakSet<WebSocket>();

  /**
   * Maximum number of messages to queue per connection per topic.
   * Prevents memory exhaustion from slow clients.
   */
  private static readonly MAX_QUEUE_SIZE_PER_TOPIC = 100;

  // --- Storage Operations ---

  async getApprovalState(planId: string): Promise<PlanApprovalState | undefined> {
    return this.planApprovals.get(planId);
  }

  async setApprovalState(planId: string, state: PlanApprovalState): Promise<void> {
    this.planApprovals.set(planId, state);
  }

  async getInviteToken(planId: string, tokenId: string): Promise<InviteToken | undefined> {
    const key = `${planId}:${tokenId}`;
    return this.inviteTokens.get(key);
  }

  async setInviteToken(planId: string, tokenId: string, token: InviteToken): Promise<void> {
    const key = `${planId}:${tokenId}`;
    this.inviteTokens.set(key, token);
  }

  async deleteInviteToken(planId: string, tokenId: string): Promise<void> {
    const key = `${planId}:${tokenId}`;
    this.inviteTokens.delete(key);
  }

  async listInviteTokens(planId: string): Promise<InviteToken[]> {
    const tokens: InviteToken[] = [];
    const now = Date.now();
    const prefix = `${planId}:`;

    for (const [key, token] of this.inviteTokens.entries()) {
      // Only include tokens for this plan
      if (!key.startsWith(prefix)) continue;

      // Filter out expired tokens
      if (token.expiresAt < now) continue;

      // Filter out revoked tokens
      if (token.revoked) continue;

      // Filter out exhausted tokens (all uses consumed)
      if (token.maxUses !== null && token.useCount >= token.maxUses) continue;

      tokens.push(token);
    }
    return tokens;
  }

  async getInviteRedemption(planId: string, userId: string): Promise<InviteRedemption | undefined> {
    // Note: This searches for ANY redemption by this user for this plan
    // The original implementation stored by "planId:tokenId:userId"
    // This matches the interface which doesn't include tokenId in the key
    for (const [key, redemption] of this.redemptions.entries()) {
      if (key.startsWith(`${planId}:`) && redemption.redeemedBy === userId) {
        return redemption;
      }
    }
    return undefined;
  }

  async setInviteRedemption(
    planId: string,
    tokenId: string,
    userId: string,
    redemption: InviteRedemption
  ): Promise<void> {
    const key = `${planId}:${tokenId}:${userId}`;
    this.redemptions.set(key, redemption);
  }

  // --- Crypto Operations ---

  async generateTokenId(): Promise<string> {
    return nanoid(8);
  }

  async generateTokenValue(): Promise<string> {
    return randomBytes(32).toString('base64url');
  }

  async hashTokenValue(value: string): Promise<string> {
    return createHash('sha256').update(value).digest('hex');
  }

  async verifyTokenHash(value: string, hash: string): Promise<boolean> {
    const computedHash = createHash('sha256').update(value).digest('hex');

    // Use constant-time comparison to prevent timing attacks
    try {
      const computedHashBuffer = Buffer.from(computedHash, 'hex');
      const hashBuffer = Buffer.from(hash, 'hex');

      // timingSafeEqual throws if lengths don't match
      if (computedHashBuffer.length !== hashBuffer.length) {
        return false;
      }

      return timingSafeEqual(computedHashBuffer, hashBuffer);
    } catch {
      // Invalid hex or other error - reject the token
      return false;
    }
  }

  // --- WebSocket Operations ---

  sendMessage(ws: unknown, message: unknown): void {
    const socket = ws as WebSocket;
    if (socket.readyState === 1) {
      // 1 = OPEN
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        this.error('[sendMessage] Failed to send message', { error });
      }
    }
  }

  getUserId(ws: unknown): string | undefined {
    return this.connectionUserIds.get(ws as WebSocket);
  }

  setUserId(ws: unknown, userId: string | undefined): void {
    const socket = ws as WebSocket;
    if (userId === undefined) {
      // Remove userId from map (not supported by WeakMap, but we can just not call this)
      // In practice, once set, userId doesn't get unset
      return;
    }
    this.connectionUserIds.set(socket, userId);
  }

  // --- Topic (Pub/Sub) Operations ---

  getTopicSubscribers(topic: string): unknown[] {
    const subscribers = this.topics.get(topic);
    return subscribers ? Array.from(subscribers) : [];
  }

  subscribeToTopic(ws: unknown, topic: string): void {
    const socket = ws as WebSocket;

    // Add socket to topic's subscriber set
    let topicSubscribers = this.topics.get(topic);
    if (!topicSubscribers) {
      topicSubscribers = new Set<WebSocket>();
      this.topics.set(topic, topicSubscribers);
    }
    topicSubscribers.add(socket);

    // Add topic to socket's subscription set
    let socketTopics = this.connectionTopics.get(socket);
    if (!socketTopics) {
      socketTopics = new Set<string>();
      this.connectionTopics.set(socket, socketTopics);
    }
    socketTopics.add(topic);
  }

  unsubscribeFromTopic(ws: unknown, topic: string): void {
    const socket = ws as WebSocket;

    // Remove socket from topic's subscriber set
    const topicSubscribers = this.topics.get(topic);
    if (topicSubscribers) {
      topicSubscribers.delete(socket);
      if (topicSubscribers.size === 0) {
        this.topics.delete(topic);
      }
    }

    // Remove topic from socket's subscription set
    const socketTopics = this.connectionTopics.get(socket);
    if (socketTopics) {
      socketTopics.delete(topic);
    }
  }

  unsubscribeFromAllTopics(ws: unknown): void {
    const socket = ws as WebSocket;
    const socketTopics = this.connectionTopics.get(socket);

    if (!socketTopics) return;

    // Remove socket from all topics
    for (const topic of socketTopics) {
      const topicSubscribers = this.topics.get(topic);
      if (topicSubscribers) {
        topicSubscribers.delete(socket);
        if (topicSubscribers.size === 0) {
          this.topics.delete(topic);
        }
      }
    }

    // Clear socket's subscription set
    socketTopics.clear();
  }

  // --- Message Queue Operations ---

  queueMessageForConnection(ws: unknown, topic: string, message: unknown): void {
    const socket = ws as WebSocket;

    let topicQueues = this.connectionMessageQueues.get(socket);
    if (!topicQueues) {
      topicQueues = new Map();
      this.connectionMessageQueues.set(socket, topicQueues);
    }

    let messages = topicQueues.get(topic);
    if (!messages) {
      messages = [];
      topicQueues.set(topic, messages);
    }

    // Remove expired messages first to make room
    const now = Date.now();
    const validMessages = messages.filter(
      (m) => now - m.queuedAt < NodePlatformAdapter.MESSAGE_QUEUE_TTL_MS
    );

    // Enforce max queue size to prevent memory exhaustion
    if (validMessages.length < NodePlatformAdapter.MAX_QUEUE_SIZE_PER_TOPIC) {
      validMessages.push({ message, queuedAt: now });
      topicQueues.set(topic, validMessages);
      this.debug('[queueMessageForConnection] Queued message', {
        topic,
        queueSize: validMessages.length,
      });
    } else {
      this.warn('[queueMessageForConnection] Queue full, dropping message', {
        topic,
        maxSize: NodePlatformAdapter.MAX_QUEUE_SIZE_PER_TOPIC,
      });
    }
  }

  getAndClearQueuedMessages(ws: unknown): Map<string, unknown[]> {
    const socket = ws as WebSocket;
    const topicQueues = this.connectionMessageQueues.get(socket);

    if (!topicQueues) {
      return new Map();
    }

    const now = Date.now();
    const result = new Map<string, unknown[]>();
    let totalMessages = 0;
    let expiredMessages = 0;

    // Filter out expired messages and extract just the message payloads
    for (const [topic, queuedMessages] of topicQueues) {
      const validMessages: unknown[] = [];
      for (const qm of queuedMessages) {
        if (now - qm.queuedAt < NodePlatformAdapter.MESSAGE_QUEUE_TTL_MS) {
          validMessages.push(qm.message);
        } else {
          expiredMessages++;
        }
      }
      if (validMessages.length > 0) {
        result.set(topic, validMessages);
        totalMessages += validMessages.length;
      }
    }

    topicQueues.clear();

    this.debug('[getAndClearQueuedMessages] Flushed queued messages', {
      topicCount: result.size,
      totalMessages,
      expiredMessages,
    });

    return result;
  }

  clearQueuedMessages(ws: unknown): void {
    const socket = ws as WebSocket;
    const topicQueues = this.connectionMessageQueues.get(socket);

    if (topicQueues) {
      const totalMessages = Array.from(topicQueues.values()).reduce(
        (sum, msgs) => sum + msgs.length,
        0
      );
      if (totalMessages > 0) {
        this.debug('[clearQueuedMessages] Cleared queued messages', {
          topicCount: topicQueues.size,
          totalMessages,
        });
      }
      topicQueues.clear();
    }
  }

  isFlushingMessages(ws: unknown): boolean {
    const socket = ws as WebSocket;
    return this.flushingConnections.has(socket);
  }

  setFlushingMessages(ws: unknown, flushing: boolean): void {
    const socket = ws as WebSocket;
    if (flushing) {
      this.flushingConnections.add(socket);
    } else {
      this.flushingConnections.delete(socket);
    }
  }

  // --- Logging ---
  // Pino logger supports both object and string arguments
  // We adapt to the simple string + args interface

  info(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.info(args[0], message);
    } else {
      logger.info(message);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.warn(args[0], message);
    } else {
      logger.warn(message);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.error(args[0], message);
    } else {
      logger.error(message);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.debug(args[0], message);
    } else {
      logger.debug(message);
    }
  }

  // --- Cleanup Methods ---
  // These should be called periodically by the server to prevent memory leaks.

  /**
   * Remove expired invite tokens from storage.
   * Returns the number of tokens removed.
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, token] of this.inviteTokens.entries()) {
      if (token.expiresAt < now) {
        this.inviteTokens.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.info('Cleaned up expired tokens', { count: removed });
    }

    return removed;
  }

  /**
   * Remove old redemption records.
   * Keeps redemptions for a configurable period (default 30 days).
   * Returns the number of redemptions removed.
   */
  cleanupOldRedemptions(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [key, redemption] of this.redemptions.entries()) {
      if (redemption.redeemedAt < cutoff) {
        this.redemptions.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.info('Cleaned up old redemptions', { count: removed });
    }

    return removed;
  }

  /**
   * Remove stale approval states (plans with no recent activity).
   * Plans without active subscribers and older than maxAge are removed.
   * Returns the number of approvals removed.
   */
  cleanupStaleApprovals(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [planId, state] of this.planApprovals.entries()) {
      // Check if plan has any active subscribers
      const topic = planId;
      const subscribers = this.topics.get(topic);
      const hasActiveSubscribers = subscribers && subscribers.size > 0;

      // Only remove if no active subscribers and state is old
      if (!hasActiveSubscribers && state.lastUpdated < cutoff) {
        this.planApprovals.delete(planId);
        removed++;
      }
    }

    if (removed > 0) {
      this.info('Cleaned up stale approvals', { count: removed });
    }

    return removed;
  }

  /**
   * Run all cleanup tasks.
   * Returns object with counts of items removed.
   */
  runCleanup(): { tokens: number; redemptions: number; approvals: number } {
    return {
      tokens: this.cleanupExpiredTokens(),
      redemptions: this.cleanupOldRedemptions(),
      approvals: this.cleanupStaleApprovals(),
    };
  }
}
