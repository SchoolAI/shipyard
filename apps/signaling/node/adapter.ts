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

import { createHash, randomBytes } from 'node:crypto';
import type { InviteRedemption, InviteToken } from '@peer-plan/schema';
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
	 * Invite tokens storage (tokenId -> token).
	 * Note: Different from original which used "planId:tokenId" keys.
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

	// --- Storage Operations ---

	async getApprovalState(planId: string): Promise<PlanApprovalState | undefined> {
		return this.planApprovals.get(planId);
	}

	async setApprovalState(planId: string, state: PlanApprovalState): Promise<void> {
		this.planApprovals.set(planId, state);
	}

	async getInviteToken(tokenId: string): Promise<InviteToken | undefined> {
		return this.inviteTokens.get(tokenId);
	}

	async setInviteToken(tokenId: string, token: InviteToken): Promise<void> {
		this.inviteTokens.set(tokenId, token);
	}

	async deleteInviteToken(tokenId: string): Promise<void> {
		this.inviteTokens.delete(tokenId);
	}

	async listInviteTokens(planId: string): Promise<InviteToken[]> {
		const tokens: InviteToken[] = [];
		for (const token of this.inviteTokens.values()) {
			if (token.planId === planId) {
				tokens.push(token);
			}
		}
		return tokens;
	}

	async getInviteRedemption(
		planId: string,
		userId: string,
	): Promise<InviteRedemption | undefined> {
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
		redemption: InviteRedemption,
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
		return computedHash === hash;
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
}
