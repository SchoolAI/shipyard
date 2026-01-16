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
	 * Backed by persistent storage with 'invite:' prefix.
	 * Key format: tokenId (not planId:tokenId as in original signaling.ts)
	 */
	private inviteTokens = new Map<string, InviteToken>();

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
	 * Must be called during Durable Object construction.
	 */
	async initialize(): Promise<void> {
		await Promise.all([
			this.restoreApprovalStateFromStorage(),
			this.restoreInviteTokensFromStorage(),
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
			logger.info(
				{ count: stored.size },
				'Restored approval states from storage'
			);
		} catch (error) {
			logger.error({ error }, 'Failed to restore approval state');
		}
	}

	/**
	 * Restore invite tokens from Durable Object storage.
	 * Also cleans up expired tokens during restoration.
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
				// Store by tokenId only (strip 'invite:' prefix)
				this.inviteTokens.set(key.replace('invite:', ''), token);
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
		const stored = await this.ctx.storage.get<PlanApprovalState>(
			`approval:${planId}`
		);
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

	async getInviteToken(tokenId: string): Promise<InviteToken | undefined> {
		// Check in-memory cache first
		const cached = this.inviteTokens.get(tokenId);
		if (cached) return cached;

		// Fall back to storage
		const stored = await this.ctx.storage.get<InviteToken>(`invite:${tokenId}`);
		if (stored) {
			this.inviteTokens.set(tokenId, stored);
		}
		return stored;
	}

	async setInviteToken(tokenId: string, token: InviteToken): Promise<void> {
		// Update in-memory cache
		this.inviteTokens.set(tokenId, token);

		// Persist to Durable Object storage
		await this.ctx.storage.put(`invite:${tokenId}`, token);
	}

	async deleteInviteToken(tokenId: string): Promise<void> {
		// Remove from in-memory cache
		this.inviteTokens.delete(tokenId);

		// Remove from Durable Object storage
		await this.ctx.storage.delete(`invite:${tokenId}`);
	}

	async listInviteTokens(planId: string): Promise<InviteToken[]> {
		const tokens: InviteToken[] = [];
		const now = Date.now();

		// Iterate through in-memory cache
		for (const token of this.inviteTokens.values()) {
			if (token.planId === planId) {
				// Skip expired or revoked tokens
				if (token.revoked || token.expiresAt < now) continue;
				// Skip exhausted tokens
				if (token.maxUses !== null && token.useCount >= token.maxUses) continue;
				tokens.push(token);
			}
		}

		return tokens;
	}

	async getInviteRedemption(
		planId: string,
		userId: string
	): Promise<InviteRedemption | undefined> {
		// Search for ANY redemption by this user for this plan
		// Key format in storage: redemption:{planId}:{tokenId}:{userId}
		const stored = await this.ctx.storage.list<InviteRedemption>({
			prefix: `redemption:${planId}:`,
		});

		for (const [key, redemption] of stored) {
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
		const key = `redemption:${planId}:${tokenId}:${userId}`;
		await this.ctx.storage.put(key, redemption);
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
		// Note: This is not timing-safe, but sufficient for our use case
		// Web Crypto API doesn't provide timing-safe comparison
		return computedHash === hash;
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
