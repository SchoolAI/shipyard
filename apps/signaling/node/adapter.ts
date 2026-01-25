/**
 * Node.js implementation of PlatformAdapter.
 *
 * This adapter wraps Node.js-specific functionality (ws WebSockets, node:crypto,
 * in-memory Maps) into the platform-agnostic interface that core handlers use.
 *
 * Simplified for basic pub/sub signaling - no approval state or message queueing.
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
import type { PlanApprovalState, PlatformAdapter } from '../core/platform.js';
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
   * Invite tokens storage (planId:tokenId -> token).
   * Uses composite key for efficient per-plan lookups.
   */
  private inviteTokens = new Map<string, InviteToken>();

  /**
   * Invite redemptions ("planId:tokenId:userId" -> redemption).
   */
  private redemptions = new Map<string, InviteRedemption>();

  /**
   * Plan ownership storage (planId -> ownerId).
   * Records which GitHub user owns each plan.
   * Uses trust-on-first-use pattern - first invite creator becomes owner.
   */
  private planOwners = new Map<string, string>();

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
   * Plan approval states (planId -> state).
   * Tracks approved/rejected/pending users for each plan.
   */
  private planApprovals = new Map<string, PlanApprovalState>();

  /**
   * Map from connection to user ID (GitHub username).
   */
  private connectionUserIds = new WeakMap<WebSocket, string>();

  // --- Storage Operations ---

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

  async getSpecificInviteRedemption(
    planId: string,
    tokenId: string,
    userId: string
  ): Promise<InviteRedemption | undefined> {
    const key = `${planId}:${tokenId}:${userId}`;
    return this.redemptions.get(key);
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

  // --- Authentication Operations ---

  async validateGitHubToken(
    token: string
  ): Promise<{ valid: boolean; username?: string; error?: string }> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Shipyard-Signaling-Server',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid or expired GitHub token' };
        }
        return { valid: false, error: `GitHub API error: ${response.status}` };
      }

      const user = (await response.json()) as { login: string };
      return { valid: true, username: user.login };
    } catch (error) {
      this.error('[validateGitHubToken] Failed to validate token', { error });
      return { valid: false, error: 'Failed to validate GitHub token' };
    }
  }

  async getPlanOwnerId(planId: string): Promise<string | null> {
    return this.planOwners.get(planId) ?? null;
  }

  async setPlanOwnerId(planId: string, ownerId: string): Promise<void> {
    this.planOwners.set(planId, ownerId);
  }

  // --- Approval State Operations ---

  async getPlanApprovalState(planId: string): Promise<PlanApprovalState | undefined> {
    return this.planApprovals.get(planId);
  }

  async setPlanApprovalState(planId: string, state: PlanApprovalState): Promise<void> {
    this.planApprovals.set(planId, state);
  }

  // --- Connection State Operations ---

  setConnectionUserId(ws: unknown, userId: string): void {
    const socket = ws as WebSocket;
    this.connectionUserIds.set(socket, userId);
  }

  getConnectionUserId(ws: unknown): string | undefined {
    const socket = ws as WebSocket;
    return this.connectionUserIds.get(socket);
  }

  // --- Notification Operations ---

  broadcastToTopic(topic: string, message: unknown, filter?: (ws: unknown) => boolean): void {
    const subscribers = this.topics.get(topic);
    if (!subscribers) return;

    for (const ws of subscribers) {
      if (filter && !filter(ws)) continue;
      this.sendMessage(ws, message);
    }
  }

  async notifyPlanOwner(planId: string, message: unknown): Promise<void> {
    const ownerId = await this.getPlanOwnerId(planId);
    if (!ownerId) return;

    const topic = `shipyard-${planId}`;
    const subscribers = this.topics.get(topic);
    if (!subscribers) return;

    for (const ws of subscribers) {
      const userId = this.getConnectionUserId(ws);
      if (userId === ownerId) {
        this.sendMessage(ws, message);
      }
    }
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
   * Run all cleanup tasks.
   * Returns object with counts of items removed.
   */
  runCleanup(): { tokens: number; redemptions: number } {
    return {
      tokens: this.cleanupExpiredTokens(),
      redemptions: this.cleanupOldRedemptions(),
    };
  }
}
