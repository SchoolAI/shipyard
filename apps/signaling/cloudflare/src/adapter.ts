/**
 * Cloudflare Durable Objects implementation of PlatformAdapter.
 *
 * This adapter wraps Cloudflare-specific functionality (Durable Object storage,
 * Web Crypto API, hibernating WebSockets) into the platform-agnostic interface
 * that core handlers use.
 *
 * Two-message authentication pattern:
 * - subscribe: Adds topics to PENDING state
 * - authenticate: Validates credentials, moves to ACTIVE state
 *
 * Storage: Uses ctx.storage for persistent storage that survives hibernation
 * Crypto: Uses Web Crypto API (all operations are async)
 * WebSocket: Uses Cloudflare's hibernation API with serializeAttachment/deserializeAttachment
 * Logging: Uses console wrapper (Cloudflare Workers don't support pino)
 */

import type { InviteRedemption, InviteToken } from '@shipyard/schema';
import type { PlatformAdapter } from '@signaling/platform.js';
import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Zod schema for GitHub user API response.
 * Only validates the fields we actually use.
 */
const GitHubUserResponseSchema = z.object({
  login: z.string(),
});

/**
 * Type guard for checking if a value is a non-null object.
 * Used for safely narrowing unknown types before logging.
 */
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Serialized connection state stored in WebSocket attachment.
 * Must be JSON-serializable (no Sets, no Maps).
 */
interface SerializedConnectionState {
  id: string;
  /** Topics awaiting authentication (pending) */
  pendingTopics: string[];
  /** Topics with active (authenticated) subscription */
  activeTopics: string[];
  /** Auth deadline timestamp (null if no deadline) */
  authDeadline: number | null;
  /** User ID after authentication (null if not authenticated) */
  userId: string | null;
}

/**
 * In-memory connection state with proper Sets for topics.
 */
interface ConnectionState {
  id: string;
  /** Topics awaiting authentication (pending) */
  pendingTopics: Set<string>;
  /** Topics with active (authenticated) subscription */
  activeTopics: Set<string>;
  /** Auth deadline timestamp (null if no deadline) */
  authDeadline: number | null;
  /** User ID after authentication (null if not authenticated) */
  userId: string | null;
}

/**
 * Zod schema for validating deserialized WebSocket attachment data.
 */
const SerializedConnectionStateSchema = z.object({
  id: z.string(),
  pendingTopics: z.array(z.string()),
  activeTopics: z.array(z.string()),
  authDeadline: z.number().nullable(),
  userId: z.string().nullable(),
});

/**
 * Type guard for checking if a value is a valid SerializedConnectionState.
 */
function isSerializedConnectionState(value: unknown): value is SerializedConnectionState {
  const result = SerializedConnectionStateSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard for Cloudflare WebSocket using duck typing.
 * Cloudflare Workers have no WebSocket constructor to check with instanceof.
 */
function isCloudflareWebSocket(value: unknown): value is WebSocket {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('send' in value) || !('close' in value)) {
    return false;
  }
  const sendProp = value.send;
  const closeProp = value.close;
  return typeof sendProp === 'function' && typeof closeProp === 'function';
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
   * In-memory cache of plan ownership.
   * Backed by persistent storage with 'plan_owner:' prefix.
   * Maps planId to GitHub username of owner.
   */
  private planOwners = new Map<string, string>();

  /**
   * Map from topic name to set of subscribed WebSockets.
   * Rebuilt on hibernation wake from WebSocket attachments.
   */
  private topics = new Map<string, Set<WebSocket>>();

  /**
   * In-memory cache of connection state per WebSocket.
   * Uses WeakMap for automatic cleanup when WebSocket is garbage collected.
   */
  private connectionStates = new WeakMap<WebSocket, ConnectionState>();

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  /** --- Initialization Methods --- */

  /**
   * Initialize the adapter by restoring state from storage.
   * Must be called during Durable Object construction using blockConcurrencyWhile().
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.restoreInviteTokensFromStorage(),
      this.restoreRedemptionsFromStorage(),
      this.restorePlanOwnersFromStorage(),
    ]);
    this.restoreTopicsFromHibernation();
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
        /** Skip and delete expired tokens */
        if (token.expiresAt < now) {
          await this.ctx.storage.delete(key);
          expiredCount++;
          continue;
        }
        /*
         * Store by planId:tokenId (strip 'invite:' prefix)
         * Key format: 'invite:{planId}:{tokenId}' -> '{planId}:{tokenId}'
         */
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
        /** Store by planId:tokenId:userId (strip 'redemption:' prefix) */
        const cacheKey = key.replace('redemption:', '');
        this.redemptions.set(cacheKey, redemption);
      }

      logger.info({ count: this.redemptions.size }, 'Restored redemptions from storage');
    } catch (error) {
      logger.error({ error }, 'Failed to restore redemptions');
    }
  }

  /**
   * Restore plan ownership from Durable Object storage into in-memory cache.
   */
  private async restorePlanOwnersFromStorage(): Promise<void> {
    try {
      const stored = await this.ctx.storage.list<string>({
        prefix: 'plan_owner:',
      });

      for (const [key, ownerId] of stored) {
        /** Store by planId (strip 'plan_owner:' prefix) */
        const planId = key.replace('plan_owner:', '');
        this.planOwners.set(planId, ownerId);
      }

      logger.info({ count: this.planOwners.size }, 'Restored plan owners from storage');
    } catch (error) {
      logger.error({ error }, 'Failed to restore plan owners');
    }
  }

  /**
   * Restore topic subscriptions from hibernated WebSocket attachments.
   * Called on hibernation wake to rebuild the topics map.
   * NOTE: Only restores ACTIVE topics, not pending ones.
   */
  private restoreTopicsFromHibernation(): void {
    const websockets = this.ctx.getWebSockets();

    for (const ws of websockets) {
      const attachment = ws.deserializeAttachment();
      if (isSerializedConnectionState(attachment)) {
        const state: ConnectionState = {
          id: attachment.id,
          pendingTopics: new Set(attachment.pendingTopics),
          activeTopics: new Set(attachment.activeTopics),
          authDeadline: attachment.authDeadline,
          userId: attachment.userId,
        };

        /** Only add ACTIVE topics to the topics map */
        for (const topic of state.activeTopics) {
          if (!this.topics.has(topic)) {
            this.topics.set(topic, new Set());
          }
          this.topics.get(topic)?.add(ws);
        }

        this.connectionStates.set(ws, state);
      }
    }

    logger.debug(
      { websocketCount: websockets.length, topicCount: this.topics.size },
      'Restored topics from hibernation'
    );
  }

  /** --- Storage Operations --- */

  async getInviteToken(planId: string, tokenId: string): Promise<InviteToken | undefined> {
    const cacheKey = `${planId}:${tokenId}`;

    /** Check in-memory cache first */
    const cached = this.inviteTokens.get(cacheKey);
    if (cached) return cached;

    /** Fall back to storage */
    const storageKey = `invite:${cacheKey}`;
    const stored = await this.ctx.storage.get<InviteToken>(storageKey);
    if (stored) {
      this.inviteTokens.set(cacheKey, stored);
    }
    return stored;
  }

  async setInviteToken(planId: string, tokenId: string, token: InviteToken): Promise<void> {
    const cacheKey = `${planId}:${tokenId}`;

    /** Update in-memory cache */
    this.inviteTokens.set(cacheKey, token);

    /** Persist to Durable Object storage */
    await this.ctx.storage.put(`invite:${cacheKey}`, token);
  }

  async deleteInviteToken(planId: string, tokenId: string): Promise<void> {
    const cacheKey = `${planId}:${tokenId}`;

    /** Remove from in-memory cache */
    this.inviteTokens.delete(cacheKey);

    /** Remove from Durable Object storage */
    await this.ctx.storage.delete(`invite:${cacheKey}`);
  }

  async listInviteTokens(planId: string): Promise<InviteToken[]> {
    const tokens: InviteToken[] = [];
    const now = Date.now();
    const prefix = `${planId}:`;

    /** Iterate through in-memory cache */
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
     * Search for ANY redemption by this user for this plan
     * Key format: planId:tokenId:userId
     */
    const prefix = `${planId}:`;

    /** First check in-memory cache */
    for (const [key, redemption] of this.redemptions.entries()) {
      if (key.startsWith(prefix) && redemption.redeemedBy === userId) {
        return redemption;
      }
    }

    /*
     * Fall back to storage if not in cache
     * This handles edge cases where cache might be incomplete
     */
    const stored = await this.ctx.storage.list<InviteRedemption>({
      prefix: `redemption:${planId}:`,
    });

    for (const [key, redemption] of stored) {
      /** Add to cache for future lookups */
      const cacheKey = key.replace('redemption:', '');
      this.redemptions.set(cacheKey, redemption);

      if (redemption.redeemedBy === userId) {
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
    const cacheKey = `${planId}:${tokenId}:${userId}`;

    /** Check in-memory cache first */
    const cached = this.redemptions.get(cacheKey);
    if (cached) {
      return cached;
    }

    /** Fall back to storage */
    const storageKey = `redemption:${cacheKey}`;
    const redemption = await this.ctx.storage.get<InviteRedemption>(storageKey);

    if (redemption) {
      /** Cache for future lookups */
      this.redemptions.set(cacheKey, redemption);
    }

    return redemption;
  }

  async setInviteRedemption(
    planId: string,
    tokenId: string,
    userId: string,
    redemption: InviteRedemption
  ): Promise<void> {
    const cacheKey = `${planId}:${tokenId}:${userId}`;

    /** Update in-memory cache */
    this.redemptions.set(cacheKey, redemption);

    /** Persist to Durable Object storage */
    const storageKey = `redemption:${cacheKey}`;
    await this.ctx.storage.put(storageKey, redemption);
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
      logger.error({ error }, '[validateGitHubToken] Failed to validate token');
      return { valid: false, error: 'Failed to validate GitHub token' };
    }
  }

  async getPlanOwnerId(planId: string): Promise<string | null> {
    /** Check in-memory cache first */
    const cached = this.planOwners.get(planId);
    if (cached) return cached;

    /** Fall back to storage */
    const storageKey = `plan_owner:${planId}`;
    const stored = await this.ctx.storage.get<string>(storageKey);
    if (stored) {
      this.planOwners.set(planId, stored);
    }
    return stored ?? null;
  }

  async setPlanOwnerId(planId: string, ownerId: string): Promise<void> {
    /** Update in-memory cache */
    this.planOwners.set(planId, ownerId);

    /** Persist to Durable Object storage */
    const storageKey = `plan_owner:${planId}`;
    await this.ctx.storage.put(storageKey, ownerId);
  }

  /** --- Crypto Operations (Web Crypto API - all async) --- */

  async generateTokenId(): Promise<string> {
    /** Short ID for URL (8 chars from UUID) */
    return crypto.randomUUID().slice(0, 8);
  }

  async generateTokenValue(): Promise<string> {
    /** 32 bytes of random data */
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    /** Convert to base64url */
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async hashTokenValue(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    /** Convert to hex string */
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async verifyTokenHash(value: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashTokenValue(value);

    /*
     * Implement timing-safe comparison to prevent timing attacks
     * Web Crypto API doesn't provide timingSafeEqual, so we implement it manually
     */
    return this.timingSafeCompare(computedHash, hash);
  }

  /**
   * Timing-safe string comparison to prevent timing attacks.
   * Compares strings in constant time regardless of where they differ.
   */
  private timingSafeCompare(a: string, b: string): boolean {
    /*
     * If lengths differ, still do full comparison to avoid timing leak
     * We'll use XOR to compare byte by byte
     */
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);

    /*
     * If lengths don't match, comparison should still take constant time
     * Use the longer length and pad the shorter one
     */
    const maxLen = Math.max(aBytes.length, bBytes.length);

    let result = aBytes.length === bBytes.length ? 0 : 1;

    for (let i = 0; i < maxLen; i++) {
      /** Use 0 for out-of-bounds to avoid timing leaks */
      const aByte = i < aBytes.length ? aBytes[i] : 0;
      const bByte = i < bBytes.length ? bBytes[i] : 0;
      result |= aByte ^ bByte;
    }

    return result === 0;
  }

  /** --- WebSocket Operations --- */

  sendMessage(ws: unknown, message: unknown): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[sendMessage] Invalid WebSocket');
      return;
    }
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error({ error }, '[sendMessage] Failed to send message');
    }
  }

  /** --- Topic (Pub/Sub) Operations --- */

  getTopicSubscribers(topic: string): unknown[] {
    const subscribers = this.topics.get(topic);
    return subscribers ? Array.from(subscribers) : [];
  }

  /**
   * @deprecated Use addPendingSubscription + activatePendingSubscription for new code
   */
  subscribeToTopic(ws: unknown, topic: string): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[subscribeToTopic] Invalid WebSocket');
      return;
    }

    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic)?.add(ws);

    const state = this.getOrCreateConnectionState(ws);
    state.activeTopics.add(topic);
    this.persistConnectionState(ws, state);
  }

  unsubscribeFromTopic(ws: unknown, topic: string): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[unsubscribeFromTopic] Invalid WebSocket');
      return;
    }

    const subscribers = this.topics.get(topic);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.topics.delete(topic);
      }
    }

    const state = this.getConnectionState(ws);
    if (state) {
      state.activeTopics.delete(topic);
      state.pendingTopics.delete(topic);
      this.persistConnectionState(ws, state);
    }
  }

  unsubscribeFromAllTopics(ws: unknown): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[unsubscribeFromAllTopics] Invalid WebSocket');
      return;
    }
    const state = this.getConnectionState(ws);

    if (!state) return;

    /** Unsubscribe from all active topics */
    for (const topic of state.activeTopics) {
      const subscribers = this.topics.get(topic);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.topics.delete(topic);
        }
      }
    }

    state.activeTopics.clear();
    state.pendingTopics.clear();
  }

  /** --- Pending Subscription Management (Two-Message Auth) --- */

  addPendingSubscription(ws: unknown, topic: string): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[addPendingSubscription] Invalid WebSocket');
      return;
    }
    const state = this.getOrCreateConnectionState(ws);
    state.pendingTopics.add(topic);
    this.persistConnectionState(ws, state);
  }

  getPendingSubscriptions(ws: unknown): string[] {
    if (!isCloudflareWebSocket(ws)) {
      return [];
    }
    const state = this.connectionStates.get(ws);
    return state ? Array.from(state.pendingTopics) : [];
  }

  activatePendingSubscription(ws: unknown, topic: string): boolean {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[activatePendingSubscription] Invalid WebSocket');
      return false;
    }

    const state = this.getOrCreateConnectionState(ws);

    /** Must be pending to activate */
    if (!state.pendingTopics.has(topic)) {
      return false;
    }

    /** Move from pending to active */
    state.pendingTopics.delete(topic);
    state.activeTopics.add(topic);

    /** Add to topics map (for getTopicSubscribers) */
    if (!this.topics.has(topic)) {
      this.topics.set(topic, new Set());
    }
    this.topics.get(topic)?.add(ws);

    this.persistConnectionState(ws, state);
    return true;
  }

  isSubscriptionPending(ws: unknown, topic: string): boolean {
    if (!isCloudflareWebSocket(ws)) {
      return false;
    }
    const state = this.connectionStates.get(ws);
    return state?.pendingTopics.has(topic) ?? false;
  }

  isSubscriptionActive(ws: unknown, topic: string): boolean {
    if (!isCloudflareWebSocket(ws)) {
      return false;
    }
    const state = this.connectionStates.get(ws);
    return state?.activeTopics.has(topic) ?? false;
  }

  setAuthDeadline(ws: unknown, timestamp: number): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[setAuthDeadline] Invalid WebSocket');
      return;
    }
    const state = this.getOrCreateConnectionState(ws);
    state.authDeadline = timestamp;
    this.persistConnectionState(ws, state);
  }

  clearAuthDeadline(ws: unknown): void {
    if (!isCloudflareWebSocket(ws)) {
      return;
    }
    const state = this.connectionStates.get(ws);
    if (state) {
      state.authDeadline = null;
      this.persistConnectionState(ws, state);
    }
  }

  getAuthDeadline(ws: unknown): number | null {
    if (!isCloudflareWebSocket(ws)) {
      return null;
    }
    const state = this.connectionStates.get(ws);
    return state?.authDeadline ?? null;
  }

  setConnectionUserId(ws: unknown, userId: string): void {
    if (!isCloudflareWebSocket(ws)) {
      logger.error({}, '[setConnectionUserId] Invalid WebSocket');
      return;
    }
    const state = this.getOrCreateConnectionState(ws);
    state.userId = userId;
    this.persistConnectionState(ws, state);
  }

  getConnectionUserId(ws: unknown): string | null {
    if (!isCloudflareWebSocket(ws)) {
      return null;
    }
    const state = this.connectionStates.get(ws);
    return state?.userId ?? null;
  }

  /** --- Logging --- */

  info(message: string, ...args: unknown[]): void {
    const firstArg = args[0];
    if (args.length > 0 && isNonNullObject(firstArg)) {
      logger.info(firstArg, message);
    } else {
      logger.info(message);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    const firstArg = args[0];
    if (args.length > 0 && isNonNullObject(firstArg)) {
      logger.warn(firstArg, message);
    } else {
      logger.warn(message);
    }
  }

  error(message: string, ...args: unknown[]): void {
    const firstArg = args[0];
    if (args.length > 0 && isNonNullObject(firstArg)) {
      logger.error(firstArg, message);
    } else {
      logger.error(message);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    const firstArg = args[0];
    if (args.length > 0 && isNonNullObject(firstArg)) {
      logger.debug(firstArg, message);
    } else {
      logger.debug(message);
    }
  }

  /** --- Private Helper Methods --- */

  /**
   * Get connection state from WebSocket.
   * First checks WeakMap, then falls back to deserialized attachment.
   */
  private getConnectionState(ws: WebSocket): ConnectionState | null {
    /** Check WeakMap first */
    const cached = this.connectionStates.get(ws);
    if (cached) return cached;

    /** Fall back to deserialized attachment (after hibernation wake) */
    const attachment = ws.deserializeAttachment();
    if (isSerializedConnectionState(attachment)) {
      const state: ConnectionState = {
        id: attachment.id,
        pendingTopics: new Set(attachment.pendingTopics),
        activeTopics: new Set(attachment.activeTopics),
        authDeadline: attachment.authDeadline,
        userId: attachment.userId,
      };
      this.connectionStates.set(ws, state);
      return state;
    }

    return null;
  }

  /**
   * Get or create connection state for a WebSocket.
   */
  private getOrCreateConnectionState(ws: WebSocket): ConnectionState {
    const existing = this.getConnectionState(ws);
    if (existing) return existing;

    const state: ConnectionState = {
      id: crypto.randomUUID(),
      pendingTopics: new Set(),
      activeTopics: new Set(),
      authDeadline: null,
      userId: null,
    };
    this.connectionStates.set(ws, state);
    return state;
  }

  /**
   * Persist connection state to WebSocket attachment for hibernation survival.
   */
  private persistConnectionState(ws: WebSocket, state: ConnectionState): void {
    ws.serializeAttachment({
      id: state.id,
      pendingTopics: Array.from(state.pendingTopics),
      activeTopics: Array.from(state.activeTopics),
      authDeadline: state.authDeadline,
      userId: state.userId,
    } satisfies SerializedConnectionState);
  }
}
