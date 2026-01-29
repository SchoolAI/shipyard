/**
 * Node.js implementation of PlatformAdapter.
 *
 * This adapter wraps Node.js-specific functionality (ws WebSockets, node:crypto,
 * in-memory Maps) into the platform-agnostic interface that core handlers use.
 *
 * Two-message authentication pattern:
 * - subscribe: Adds topics to PENDING state
 * - authenticate: Validates credentials, moves to ACTIVE state
 *
 * Storage: Uses in-memory Maps (suitable for single-process development server)
 * Crypto: Uses node:crypto (synchronous, wrapped in Promise.resolve())
 * WebSocket: Uses ws library types
 * Logging: Uses pino logger
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { InviteRedemption, InviteToken } from '@shipyard/schema';
import { nanoid } from 'nanoid';
import { WebSocket } from 'ws';
import { z } from 'zod';
import type { PlatformAdapter } from '../core/platform.js';
import { logger } from '../src/logger.js';

/**
 * Zod schema for GitHub user API response.
 * Only validates the fields we actually use.
 */
const GitHubUserResponseSchema = z.object({
  login: z.string(),
});

/**
 * Type guard for checking if a value is a ws WebSocket.
 * Uses instanceof check since we import the class directly.
 */
function isWebSocket(value: unknown): value is WebSocket {
  return value instanceof WebSocket;
}

/**
 * Connection state for two-message auth pattern.
 */
interface ConnectionState {
  /** Topics awaiting authentication */
  pendingTopics: Set<string>;
  /** Topics with active (authenticated) subscription */
  activeTopics: Set<string>;
  /** Auth deadline timestamp (null if no deadline) */
  authDeadline: number | null;
  /** User ID after authentication (null if not authenticated) */
  userId: string | null;
}

/**
 * Node.js platform adapter implementation.
 *
 * Uses in-memory Maps for storage (suitable for single-process dev server).
 * In production, consider using Redis or another persistent store.
 */
export class NodePlatformAdapter implements PlatformAdapter {
  /** --- Storage Maps --- */

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
   * NOTE: Only contains ACTIVE (authenticated) subscriptions.
   */
  private topics = new Map<string, Set<WebSocket>>();

  /**
   * Connection state for each WebSocket.
   * Tracks pending/active topics, auth deadline, and user ID.
   */
  private connectionStates = new WeakMap<WebSocket, ConnectionState>();

  /**
   * Connections with auth deadlines (for timeout enforcement).
   * Maps WebSocket to deadline timestamp. Needed because WeakMap is not iterable.
   */
  private connectionsWithDeadlines = new Map<WebSocket, number>();

  /**
   * Get or create connection state for a WebSocket.
   */
  private getConnectionState(ws: WebSocket): ConnectionState {
    let state = this.connectionStates.get(ws);
    if (!state) {
      state = {
        pendingTopics: new Set(),
        activeTopics: new Set(),
        authDeadline: null,
        userId: null,
      };
      this.connectionStates.set(ws, state);
    }
    return state;
  }

  /** --- Storage Operations --- */

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
      /** Only include tokens for this plan */
      if (!key.startsWith(prefix)) continue;

      /** Filter out expired tokens */
      if (token.expiresAt < now) continue;

      /** Filter out revoked tokens */
      if (token.revoked) continue;

      /** Filter out exhausted tokens (all uses consumed) */
      if (token.maxUses !== null && token.useCount >= token.maxUses) continue;

      tokens.push(token);
    }
    return tokens;
  }

  async getInviteRedemption(planId: string, userId: string): Promise<InviteRedemption | undefined> {
    /*
     * Note: This searches for ANY redemption by this user for this plan
     * The original implementation stored by "planId:tokenId:userId"
     * This matches the interface which doesn't include tokenId in the key
     */
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

  /** --- Authentication Operations --- */

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

      const json: unknown = await response.json();
      const parseResult = GitHubUserResponseSchema.safeParse(json);
      if (!parseResult.success) {
        return { valid: false, error: 'Invalid response from GitHub API' };
      }
      return { valid: true, username: parseResult.data.login };
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

  /** --- Crypto Operations --- */

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

    /** Use constant-time comparison to prevent timing attacks */
    try {
      const computedHashBuffer = Buffer.from(computedHash, 'hex');
      const hashBuffer = Buffer.from(hash, 'hex');

      /** timingSafeEqual throws if lengths don't match */
      if (computedHashBuffer.length !== hashBuffer.length) {
        return false;
      }

      return timingSafeEqual(computedHashBuffer, hashBuffer);
    } catch {
      /** Invalid hex or other error - reject the token */
      return false;
    }
  }

  /** --- WebSocket Operations --- */

  sendMessage(ws: unknown, message: unknown): void {
    if (!isWebSocket(ws)) {
      this.error('[sendMessage] Invalid WebSocket');
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        this.error('[sendMessage] Failed to send message', { error });
      }
    }
  }

  /** --- Topic (Pub/Sub) Operations --- */

  getTopicSubscribers(topic: string): unknown[] {
    const subscribers = this.topics.get(topic);
    return subscribers ? Array.from(subscribers) : [];
  }

  unsubscribeFromTopic(ws: unknown, topic: string): void {
    if (!isWebSocket(ws)) {
      this.error('[unsubscribeFromTopic] Invalid WebSocket');
      return;
    }

    const topicSubscribers = this.topics.get(topic);
    if (topicSubscribers) {
      topicSubscribers.delete(ws);
      if (topicSubscribers.size === 0) {
        this.topics.delete(topic);
      }
    }

    /** Also clean up from connection state */
    const state = this.connectionStates.get(ws);
    if (state) {
      state.activeTopics.delete(topic);
      state.pendingTopics.delete(topic);
    }
  }

  /**
   * Remove a WebSocket from a topic's subscriber set.
   * Cleans up the topic entry if no subscribers remain.
   */
  private removeFromTopicSubscribers(ws: WebSocket, topic: string): void {
    const topicSubscribers = this.topics.get(topic);
    if (topicSubscribers) {
      topicSubscribers.delete(ws);
      if (topicSubscribers.size === 0) {
        this.topics.delete(topic);
      }
    }
  }

  /**
   * Remove a WebSocket from all topics in a Set.
   */
  private removeFromAllTopicsInSet(ws: WebSocket, topicSet: Set<string>): void {
    for (const topic of topicSet) {
      this.removeFromTopicSubscribers(ws, topic);
    }
  }

  unsubscribeFromAllTopics(ws: unknown): void {
    if (!isWebSocket(ws)) {
      this.error('[unsubscribeFromAllTopics] Invalid WebSocket');
      return;
    }

    /** Clean up using connection state */
    const state = this.connectionStates.get(ws);
    if (state) {
      this.removeFromAllTopicsInSet(ws, state.activeTopics);
      state.activeTopics.clear();
      state.pendingTopics.clear();
    }
  }

  /** --- Pending Subscription Management (Two-Message Auth) --- */

  addPendingSubscription(ws: unknown, topic: string): void {
    if (!isWebSocket(ws)) {
      this.error('[addPendingSubscription] Invalid WebSocket');
      return;
    }
    const state = this.getConnectionState(ws);
    state.pendingTopics.add(topic);
  }

  getPendingSubscriptions(ws: unknown): string[] {
    if (!isWebSocket(ws)) {
      return [];
    }
    const state = this.connectionStates.get(ws);
    return state ? Array.from(state.pendingTopics) : [];
  }

  activatePendingSubscription(ws: unknown, topic: string): boolean {
    if (!isWebSocket(ws)) {
      this.error('[activatePendingSubscription] Invalid WebSocket');
      return false;
    }

    const state = this.getConnectionState(ws);

    /** Must be pending to activate */
    if (!state.pendingTopics.has(topic)) {
      return false;
    }

    /** Move from pending to active */
    state.pendingTopics.delete(topic);
    state.activeTopics.add(topic);

    /** Add to topics map (for getTopicSubscribers) */
    let topicSubscribers = this.topics.get(topic);
    if (!topicSubscribers) {
      topicSubscribers = new Set<WebSocket>();
      this.topics.set(topic, topicSubscribers);
    }
    topicSubscribers.add(ws);

    return true;
  }

  isSubscriptionPending(ws: unknown, topic: string): boolean {
    if (!isWebSocket(ws)) {
      return false;
    }
    const state = this.connectionStates.get(ws);
    return state?.pendingTopics.has(topic) ?? false;
  }

  isSubscriptionActive(ws: unknown, topic: string): boolean {
    if (!isWebSocket(ws)) {
      return false;
    }
    const state = this.connectionStates.get(ws);
    return state?.activeTopics.has(topic) ?? false;
  }

  setAuthDeadline(ws: unknown, timestamp: number): void {
    if (!isWebSocket(ws)) {
      this.error('[setAuthDeadline] Invalid WebSocket');
      return;
    }
    const state = this.getConnectionState(ws);
    state.authDeadline = timestamp;
    this.connectionsWithDeadlines.set(ws, timestamp);
  }

  clearAuthDeadline(ws: unknown): void {
    if (!isWebSocket(ws)) {
      return;
    }
    const state = this.connectionStates.get(ws);
    if (state) {
      state.authDeadline = null;
    }
    if (isWebSocket(ws)) {
      this.connectionsWithDeadlines.delete(ws);
    }
  }

  getAuthDeadline(ws: unknown): number | null {
    if (!isWebSocket(ws)) {
      return null;
    }
    const state = this.connectionStates.get(ws);
    return state?.authDeadline ?? null;
  }

  getAllConnectionsWithDeadlines(): Array<{ ws: unknown; deadline: number }> {
    const result: Array<{ ws: unknown; deadline: number }> = [];
    for (const [ws, deadline] of this.connectionsWithDeadlines.entries()) {
      result.push({ ws, deadline });
    }
    return result;
  }

  setConnectionUserId(ws: unknown, userId: string): void {
    if (!isWebSocket(ws)) {
      this.error('[setConnectionUserId] Invalid WebSocket');
      return;
    }
    const state = this.getConnectionState(ws);
    state.userId = userId;
  }

  getConnectionUserId(ws: unknown): string | null {
    if (!isWebSocket(ws)) {
      return null;
    }
    const state = this.connectionStates.get(ws);
    return state?.userId ?? null;
  }

  /*
   * --- Logging ---
   * Pino logger supports both object and string arguments
   * We adapt to the simple string + args interface
   */

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

  /*
   * --- Cleanup Methods ---
   * These should be called periodically by the server to prevent memory leaks.
   */

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
