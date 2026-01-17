/**
 * Cloudflare Durable Objects implementation of PlatformAdapter.
 *
 * This adapter wraps Cloudflare-specific functionality (Durable Object storage,
 * Web Crypto API, hibernating WebSockets) into the platform-agnostic interface
 * that core handlers use.
 *
 * Storage: Uses ctx.storage for persistent storage that survives hibernation
 * Crypto: Uses Web Crypto API (all operations are async)
 * WebSocket: Uses Cloudflare's hibernation API with serializeAttachment/deserializeAttachment
 * Logging: Uses console wrapper (Cloudflare Workers don't support pino)
 *
 * Key Differences from Node.js Adapter:
 * - All storage persists to Durable Object storage (survives hibernation)
 * - Crypto operations are truly async (Web Crypto API)
 * - WebSocket state stored via ws.serializeAttachment() instead of WeakMap
 * - Must handle hibernation wake (restore topics from WebSocket attachments)
 */

import type { InviteRedemption, InviteToken } from '@peer-plan/schema';
import type { PlatformAdapter } from '../../core/platform.js';
import type { PlanApprovalState } from '../../core/types.js';
import { logger } from './logger.js';

/**
 * Serialized connection state stored in WebSocket attachment.
 * Must be JSON-serializable (no Sets, no Maps).
 */
interface SerializedConnectionState {
  id: string;
  topics: string[];
  userId?: string;
}

/**
 * In-memory connection state with proper Set for topics.
 */
interface ConnectionState {
  id: string;
  topics: Set<string>;
  userId?: string;
}

/**
 * Cloudflare Durable Objects platform adapter implementation.
 *
 * Requires a DurableObjectState context for storage operations.
 * All state survives hibernation via ctx.storage and WebSocket attachments.
 */
export class CloudflarePlatformAdapter implements PlatformAdapter {
  /**
   * Durable Object context for storage operations.
   */
  private ctx: DurableObjectState;

  /**
   * In-memory cache of plan approval states.
   * Backed by persistent storage with 'approval:' prefix.
   */
  private planApprovals = new Map<string, PlanApprovalState>();

  /**
   * In-memory cache of invite tokens.
   * Backed by persistent storage with 'invite:{planId}:{tokenId}' prefix.
   * Key format: planId:tokenId for efficient per-plan lookups.
   */
  private inviteTokens = new Map<string, InviteToken>();

  /**
   * In-memory cache of invite redemptions.
   * Backed by persistent storage with 'redemption:' prefix.
   * Key format: planId:tokenId:userId
   */
  private redemptions = new Map<string, InviteRedemption>();

  /**
   * Map from topic name to set of subscribed WebSockets.
   * Rebuilt on hibernation wake from WebSocket attachments.
   */
  private topics = new Map<string, Set<WebSocket>>();

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  // --- Initialization Methods ---

  /**
   * Initialize the adapter by restoring state from storage.
   * Must be called during Durable Object construction using blockConcurrencyWhile().
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.restoreApprovalStateFromStorage(),
      this.restoreInviteTokensFromStorage(),
      this.restoreRedemptionsFromStorage(),
    ]);
    this.restoreTopicsFromHibernation();
  }

  /**
   * Restore approval states from Durable Object storage.
   * Called on DO construction and hibernation wake.
   */
  private async restoreApprovalStateFromStorage(): Promise<void> {
    try {
      const stored = await this.ctx.storage.list<PlanApprovalState>({
        prefix: 'approval:',
      });
      for (const [key, value] of stored) {
        const planId = key.replace('approval:', '');
        this.planApprovals.set(planId, value);
      }
      logger.info({ count: stored.size }, 'Restored approval states from storage');
    } catch (error) {
      logger.error({ error }, 'Failed to restore approval state');
    }
  }

  /**
   * Restore invite tokens from Durable Object storage.
   * Also cleans up expired tokens during restoration.
   * Key format in storage: 'invite:{planId}:{tokenId}'
   */
  private async restoreInviteTokensFromStorage(): Promise<void> {
    try {
      const stored = await this.ctx.storage.list<InviteToken>({
        prefix: 'invite:',
      });
      const now = Date.now();
      let expiredCount = 0;

      for (const [key, token] of stored) {
        // Skip and delete expired tokens
        if (token.expiresAt < now) {
          await this.ctx.storage.delete(key);
          expiredCount++;
          continue;
        }
        // Store by planId:tokenId (strip 'invite:' prefix)
        // Key format: 'invite:{planId}:{tokenId}' -> '{planId}:{tokenId}'
        const cacheKey = key.replace('invite:', '');
        this.inviteTokens.set(cacheKey, token);
      }

      logger.info(
        {
          restoredCount: this.inviteTokens.size,
          expiredCount,
        },
        'Restored invite tokens from storage'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to restore invite tokens');
    }
  }

  /**
   * Restore redemptions from Durable Object storage into in-memory cache.
   */
  private async restoreRedemptionsFromStorage(): Promise<void> {
    try {
      const stored = await this.ctx.storage.list<InviteRedemption>({
        prefix: 'redemption:',
      });

      for (const [key, redemption] of stored) {
        // Store by planId:tokenId:userId (strip 'redemption:' prefix)
        const cacheKey = key.replace('redemption:', '');
        this.redemptions.set(cacheKey, redemption);
      }

      logger.info({ count: this.redemptions.size }, 'Restored redemptions from storage');
    } catch (error) {
      logger.error({ error }, 'Failed to restore redemptions');
    }
  }

  /**
   * Restore topic subscriptions from hibernated WebSocket attachments.
   * Called on hibernation wake to rebuild the topics map.
   */
  private restoreTopicsFromHibernation(): void {
    const websockets = this.ctx.getWebSockets();

    for (const ws of websockets) {
      const attachment = ws.deserializeAttachment() as SerializedConnectionState | null;
      if (attachment) {
        // Restore topics Set from serialized array
        const state: ConnectionState = {
          id: attachment.id,
          topics: new Set(attachment.topics),
          userId: attachment.userId,
        };

        // Rebuild topic -> WebSocket mapping
        for (const topic of state.topics) {
          if (!this.topics.has(topic)) {
            this.topics.set(topic, new Set());
          }
          this.topics.get(topic)!.add(ws);
        }

        // Store in-memory state on WebSocket
        (ws as any).__state = state;
      }
    }

    logger.debug(
      { websocketCount: websockets.length, topicCount: this.topics.size },
      'Restored topics from hibernation'
    );
  }

  // --- Storage Operations ---

  async getApprovalState(planId: string): Promise<PlanApprovalState | undefined> {
    // Check in-memory cache first
    const cached = this.planApprovals.get(planId);
    if (cached) return cached;

    // Fall back to storage (handles case where cache was cleared)
    const stored = await this.ctx.storage.get<PlanApprovalState>(`approval:${planId}`);
    if (stored) {
      this.planApprovals.set(planId, stored);
    }
    return stored;
  }

  async setApprovalState(planId: string, state: PlanApprovalState): Promise<void> {
    // Update in-memory cache
    this.planApprovals.set(planId, state);

    // Persist to Durable Object storage
    await this.ctx.storage.put(`approval:${planId}`, state);
  }

  async getInviteToken(planId: string, tokenId: string): Promise<InviteToken | undefined> {
    const cacheKey = `${planId}:${tokenId}`;

    // Check in-memory cache first
    const cached = this.inviteTokens.get(cacheKey);
    if (cached) return cached;

    // Fall back to storage
    const storageKey = `invite:${cacheKey}`;
    const stored = await this.ctx.storage.get<InviteToken>(storageKey);
    if (stored) {
      this.inviteTokens.set(cacheKey, stored);
    }
    return stored;
  }

  async setInviteToken(planId: string, tokenId: string, token: InviteToken): Promise<void> {
    const cacheKey = `${planId}:${tokenId}`;

    // Update in-memory cache
    this.inviteTokens.set(cacheKey, token);

    // Persist to Durable Object storage
    await this.ctx.storage.put(`invite:${cacheKey}`, token);
  }

  async deleteInviteToken(planId: string, tokenId: string): Promise<void> {
    const cacheKey = `${planId}:${tokenId}`;

    // Remove from in-memory cache
    this.inviteTokens.delete(cacheKey);

    // Remove from Durable Object storage
    await this.ctx.storage.delete(`invite:${cacheKey}`);
  }

  async listInviteTokens(planId: string): Promise<InviteToken[]> {
    const tokens: InviteToken[] = [];
    const now = Date.now();
    const prefix = `${planId}:`;

    // Iterate through in-memory cache
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
    // Search for ANY redemption by this user for this plan
    // Key format: planId:tokenId:userId
    const prefix = `${planId}:`;

    // First check in-memory cache
    for (const [key, redemption] of this.redemptions.entries()) {
      if (key.startsWith(prefix) && redemption.redeemedBy === userId) {
        return redemption;
      }
    }

    // Fall back to storage if not in cache
    // This handles edge cases where cache might be incomplete
    const stored = await this.ctx.storage.list<InviteRedemption>({
      prefix: `redemption:${planId}:`,
    });

    for (const [key, redemption] of stored) {
      // Add to cache for future lookups
      const cacheKey = key.replace('redemption:', '');
      this.redemptions.set(cacheKey, redemption);

      if (redemption.redeemedBy === userId) {
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
    const cacheKey = `${planId}:${tokenId}:${userId}`;

    // Update in-memory cache
    this.redemptions.set(cacheKey, redemption);

    // Persist to Durable Object storage
    const storageKey = `redemption:${cacheKey}`;
    await this.ctx.storage.put(storageKey, redemption);
  }

  // --- Crypto Operations (Web Crypto API - all async) ---

  async generateTokenId(): Promise<string> {
    // Short ID for URL (8 chars from UUID)
    return crypto.randomUUID().slice(0, 8);
  }

  async generateTokenValue(): Promise<string> {
    // 32 bytes of random data
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    // Convert to base64url
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async hashTokenValue(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to hex string
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async verifyTokenHash(value: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashTokenValue(value);

    // Implement timing-safe comparison to prevent timing attacks
    // Web Crypto API doesn't provide timingSafeEqual, so we implement it manually
    return this.timingSafeCompare(computedHash, hash);
  }

  /**
   * Timing-safe string comparison to prevent timing attacks.
   * Compares strings in constant time regardless of where they differ.
   */
  private timingSafeCompare(a: string, b: string): boolean {
    // If lengths differ, still do full comparison to avoid timing leak
    // We'll use XOR to compare byte by byte
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);

    // If lengths don't match, comparison should still take constant time
    // Use the longer length and pad the shorter one
    const maxLen = Math.max(aBytes.length, bBytes.length);

    let result = aBytes.length === bBytes.length ? 0 : 1;

    for (let i = 0; i < maxLen; i++) {
      // Use 0 for out-of-bounds to avoid timing leaks
      const aByte = i < aBytes.length ? aBytes[i] : 0;
      const bByte = i < bBytes.length ? bBytes[i] : 0;
      result |= aByte ^ bByte;
    }

    return result === 0;
  }

  // --- WebSocket Operations ---

  sendMessage(ws: unknown, message: unknown): void {
    const socket = ws as WebSocket;
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      logger.error({ error }, '[sendMessage] Failed to send message');
    }
  }

  getUserId(ws: unknown): string | undefined {
    const state = this.getConnectionState(ws as WebSocket);
    return state?.userId;
  }

  setUserId(ws: unknown, userId: string | undefined): void {
    const socket = ws as WebSocket;
    let state = this.getConnectionState(socket);

    if (!state) {
      // Initialize connection state if not exists
      state = {
        id: crypto.randomUUID(),
        topics: new Set(),
        userId,
      };
      (socket as any).__state = state;
    } else {
      state.userId = userId;
    }

    // Persist to WebSocket attachment for hibernation survival
    this.persistConnectionState(socket, state);
  }

  // --- Topic (Pub/Sub) Operations ---

  getTopicSubscribers(topic: string): unknown[] {
    const subscribers = this.topics.get(topic);
    return subscribers ? Array.from(subscribers) : [];
  }

  subscribeToTopic(ws: unknown, topic: string): void {
    const socket = ws as WebSocket;

    // Add socket to topic's subscriber set
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic)!.add(socket);

    // Update connection state
    let state = this.getConnectionState(socket);
    if (!state) {
      state = {
        id: crypto.randomUUID(),
        topics: new Set(),
      };
      (socket as any).__state = state;
    }
    state.topics.add(topic);

    // Persist for hibernation survival
    this.persistConnectionState(socket, state);
  }

  unsubscribeFromTopic(ws: unknown, topic: string): void {
    const socket = ws as WebSocket;

    // Remove socket from topic's subscriber set
    const subscribers = this.topics.get(topic);
    if (subscribers) {
      subscribers.delete(socket);
      if (subscribers.size === 0) {
        this.topics.delete(topic);
      }
    }

    // Update connection state
    const state = this.getConnectionState(socket);
    if (state) {
      state.topics.delete(topic);
      this.persistConnectionState(socket, state);
    }
  }

  unsubscribeFromAllTopics(ws: unknown): void {
    const socket = ws as WebSocket;
    const state = this.getConnectionState(socket);

    if (!state) return;

    // Remove socket from all topics
    for (const topic of state.topics) {
      const subscribers = this.topics.get(topic);
      if (subscribers) {
        subscribers.delete(socket);
        if (subscribers.size === 0) {
          this.topics.delete(topic);
        }
      }
    }

    // Clear connection's topic set (no need to persist since connection is closing)
    state.topics.clear();
  }

  // --- Logging ---

  info(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      logger.info(args[0] as Record<string, unknown>, message);
    } else {
      logger.info(message);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      logger.warn(args[0] as Record<string, unknown>, message);
    } else {
      logger.warn(message);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      logger.error(args[0] as Record<string, unknown>, message);
    } else {
      logger.error(message);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      logger.debug(args[0] as Record<string, unknown>, message);
    } else {
      logger.debug(message);
    }
  }

  // --- Private Helper Methods ---

  /**
   * Get connection state from WebSocket.
   * First checks in-memory state, then falls back to deserialized attachment.
   */
  private getConnectionState(ws: WebSocket): ConnectionState | null {
    // Check in-memory state first
    const inMemory = (ws as any).__state as ConnectionState | undefined;
    if (inMemory) return inMemory;

    // Fall back to deserialized attachment (after hibernation wake)
    const attachment = ws.deserializeAttachment() as SerializedConnectionState | null;
    if (attachment) {
      const state: ConnectionState = {
        id: attachment.id,
        topics: new Set(attachment.topics),
        userId: attachment.userId,
      };
      (ws as any).__state = state;
      return state;
    }

    return null;
  }

  /**
   * Persist connection state to WebSocket attachment for hibernation survival.
   */
  private persistConnectionState(ws: WebSocket, state: ConnectionState): void {
    ws.serializeAttachment({
      id: state.id,
      topics: Array.from(state.topics),
      userId: state.userId,
    } satisfies SerializedConnectionState);
  }
}
