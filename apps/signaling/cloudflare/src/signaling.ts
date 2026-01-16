/**
 * Durable Object for y-webrtc signaling with WebSocket Hibernation
 *
 * Implements the y-webrtc signaling protocol:
 * - subscribe: Client subscribes to room topics (plan IDs)
 * - unsubscribe: Client leaves room topics
 * - publish: Broadcast message to all subscribers of a topic
 * - ping/pong: Keepalive (handled automatically via hibernation API)
 * - approval_state: Owner pushes approval state for access control
 *
 * WebSocket Hibernation allows the DO to sleep while connections remain open,
 * dramatically reducing costs for idle connections.
 *
 * Access Control:
 * The signaling server enforces approval at the peer discovery layer.
 * When a user is not approved, they cannot discover or connect to other peers.
 * This prevents unapproved users from receiving CRDT data.
 */

import { DurableObject } from 'cloudflare:workers';
import type {
  ApprovalStateMessage,
  CreateInviteRequest,
  InviteRedemption,
  InviteToken,
  ListInvitesRequest,
  PlanApprovalState,
  PublishMessage,
  RedeemInviteRequest,
  RevokeInviteRequest,
  SignalingMessage,
  SubscribeMessage,
  TokenValidationError,
  UnsubscribeMessage,
} from '../../core/types.js';
import { logger } from './logger.js';

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
}

// Per-connection state stored as WebSocket attachment
interface ConnectionState {
  id: string;
  topics: Set<string>;
  userId?: string; // GitHub username for this connection
}

// Serialized form for WebSocket attachment (Sets can't be serialized)
interface SerializedConnectionState {
  id: string;
  topics: string[];
  userId?: string;
}

// PlanApprovalState, InviteToken, and InviteRedemption types imported from core/types.ts

export class SignalingRoom extends DurableObject<Env> {
  // In-memory topic -> WebSocket mapping (rebuilt on wake from hibernation)
  private topics: Map<string, Set<WebSocket>> = new Map();

  // Plan approval state: planId -> approval state
  // Cached in memory for fast access, persisted to storage for hibernation survival
  private planApprovals: Map<string, PlanApprovalState> = new Map();

  // Invite tokens: "planId:tokenId" -> InviteToken
  // Cached in memory, persisted to storage for hibernation survival
  private inviteTokens: Map<string, InviteToken> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore state from hibernated WebSockets
    // This runs both on first creation AND when waking from hibernation
    this.restoreFromHibernation();

    // Restore approval state and invite tokens from storage (async, but fast)
    this.restoreApprovalState();
    this.restoreInviteTokens();
  }

  /**
   * Restore approval state from Durable Object storage.
   * This ensures approval state survives hibernation.
   */
  private async restoreApprovalState(): Promise<void> {
    try {
      const stored = await this.ctx.storage.list<PlanApprovalState>({ prefix: 'approval:' });
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
   */
  private async restoreInviteTokens(): Promise<void> {
    try {
      const stored = await this.ctx.storage.list<InviteToken>({ prefix: 'invite:' });
      const now = Date.now();
      let expiredCount = 0;

      for (const [key, token] of stored) {
        // Skip and delete expired tokens
        if (token.expiresAt < now) {
          await this.ctx.storage.delete(key);
          expiredCount++;
          continue;
        }
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
   * Restore topic subscriptions from hibernated WebSocket attachments
   */
  private restoreFromHibernation(): void {
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
          const topicSet = this.topics.get(topic);
          if (topicSet) {
            topicSet.add(ws);
          }
        }

        // Update the in-memory state on the WebSocket
        (ws as any).__state = state;
      }
    }
  }

  /**
   * Handle incoming HTTP requests (WebSocket upgrades)
   */
  async fetch(request: Request): Promise<Response> {
    // Create the WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket with hibernation support
    // This tells the runtime this connection can hibernate
    this.ctx.acceptWebSocket(server);

    // Initialize connection state
    const state: ConnectionState = {
      id: crypto.randomUUID(),
      topics: new Set(),
    };

    // Store state as attachment (survives hibernation)
    server.serializeAttachment({
      id: state.id,
      topics: [],
    } satisfies SerializedConnectionState);

    // Also keep in memory for fast access
    (server as any).__state = state;

    // Return the client side of the WebSocket
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle incoming WebSocket messages
   * Called when a message arrives (may wake DO from hibernation)
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data: SignalingMessage = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message)
      );

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(ws, data);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, data);
          break;
        case 'publish':
          this.handlePublish(ws, data);
          break;
        case 'ping':
          // Handled by setWebSocketAutoResponse, but just in case
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'approval_state':
          await this.handleApprovalState(ws, data);
          break;
        // Invite token handlers
        case 'create_invite':
          await this.handleCreateInvite(ws, data);
          break;
        case 'redeem_invite':
          await this.handleRedeemInvite(ws, data);
          break;
        case 'revoke_invite':
          await this.handleRevokeInvite(ws, data);
          break;
        case 'list_invites':
          await this.handleListInvites(ws, data);
          break;
        default: {
          // Exhaustive check - TypeScript will error if we miss a case
          const _exhaustive: never = data;
          logger.error({ message: _exhaustive }, 'Unhandled message type');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error handling message');
    }
  }

  /**
   * Handle client subscribing to topics (room names)
   */
  private handleSubscribe(ws: WebSocket, message: SubscribeMessage): void {
    const state = this.getState(ws);
    if (!state) return;

    // Store userId if provided (for approval checking)
    if (message.userId) {
      state.userId = message.userId;
    }

    for (const topic of message.topics || []) {
      if (typeof topic !== 'string') continue;

      // Add to topic map
      if (!this.topics.has(topic)) {
        this.topics.set(topic, new Set());
      }
      const topicSet = this.topics.get(topic);
      if (topicSet) {
        topicSet.add(ws);
      }

      // Track on connection state
      state.topics.add(topic);
    }

    // Persist updated state for hibernation
    this.persistState(ws, state);
  }

  /**
   * Handle client unsubscribing from topics
   */
  private handleUnsubscribe(ws: WebSocket, message: UnsubscribeMessage): void {
    const state = this.getState(ws);
    if (!state) return;

    for (const topic of message.topics || []) {
      const subscribers = this.topics.get(topic);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.topics.delete(topic);
        }
      }
      state.topics.delete(topic);
    }

    // Persist updated state for hibernation
    this.persistState(ws, state);
  }

  /**
   * Extract plan ID from topic.
   * Topics follow the format: "peer-plan-{planId}" for plan documents.
   */
  private extractPlanId(topic: string): string | null {
    const prefix = 'peer-plan-';
    if (topic.startsWith(prefix)) {
      return topic.slice(prefix.length);
    }
    return null;
  }

  /**
   * Check if a user is approved for a plan.
   * Returns true if:
   * - User is the owner
   * - User is in the approved list
   * Returns false if:
   * - User is in rejected list
   * - No approval state exists (deny by default until owner pushes state)
   * - No user ID provided (must authenticate first)
   */
  private isUserApproved(planId: string, userId: string | undefined): boolean {
    const approval = this.planApprovals.get(planId);

    // No approval state - DENY by default
    // This prevents race conditions where pending users connect before owner pushes state
    // Once owner connects and pushes approval state, legitimate users will be approved
    if (!approval) {
      logger.debug(
        { planId },
        '[isUserApproved] No approval state for plan, denying access'
      );
      return false;
    }

    // No user ID - DENY (must authenticate to access plans)
    // This prevents unauthenticated users from syncing plan data
    if (!userId) {
      logger.debug(
        { planId },
        '[isUserApproved] No userId provided for plan, denying access'
      );
      return false;
    }

    // Owner is always approved
    if (userId === approval.ownerId) return true;

    // Check if rejected first (takes precedence)
    if (approval.rejectedUsers.includes(userId)) return false;

    // Check if approved
    return approval.approvedUsers.includes(userId);
  }

  /**
   * Check if a user is rejected for a plan.
   */
  private isUserRejected(planId: string, userId: string | undefined): boolean {
    const approval = this.planApprovals.get(planId);
    if (!approval || !userId) return false;
    return approval.rejectedUsers.includes(userId);
  }

  /**
   * Handle publish (broadcast to topic subscribers)
   * This is the main signaling message for WebRTC offer/answer/ICE
   *
   * Access control is enforced here:
   * - Rejected users cannot send or receive messages
   * - Pending users can only communicate with other pending users (for awareness)
   * - Approved users can communicate with all approved users and the owner
   */
  private handlePublish(ws: WebSocket, message: PublishMessage): void {
    if (!message.topic) return;

    const subscribers = this.topics.get(message.topic);
    if (!subscribers) return;

    const senderState = this.getState(ws);
    const senderUserId = senderState?.userId;
    const planId = this.extractPlanId(message.topic);

    // If this is a plan document topic, enforce approval
    if (planId) {
      // Block rejected senders completely
      if (this.isUserRejected(planId, senderUserId)) {
        return;
      }

      const senderApproved = this.isUserApproved(planId, senderUserId);

      // Add client count to message (y-webrtc uses this)
      const outMessage = JSON.stringify({
        ...message,
        clients: subscribers.size,
      });

      // Broadcast to filtered subscribers based on approval
      for (const subscriber of subscribers) {
        if (subscriber === ws) continue; // Don't send back to sender

        const subscriberState = this.getState(subscriber);
        const subscriberUserId = subscriberState?.userId;

        // Block rejected recipients
        if (this.isUserRejected(planId, subscriberUserId)) {
          continue;
        }

        const subscriberApproved = this.isUserApproved(planId, subscriberUserId);

        // Relay logic:
        // - If sender is approved, only send to other approved users
        // - If sender is pending, only send to other pending users (awareness sync)
        // This prevents approved content from leaking to pending users
        if (senderApproved === subscriberApproved) {
          try {
            subscriber.send(outMessage);
          } catch {
            // Connection may be dead, will be cleaned up on close
          }
        }
      }
    } else {
      // Non-plan topics (e.g., plan-index) - broadcast to all
      const outMessage = JSON.stringify({
        ...message,
        clients: subscribers.size,
      });

      for (const subscriber of subscribers) {
        try {
          subscriber.send(outMessage);
        } catch {
          // Connection may be dead, will be cleaned up on close
        }
      }
    }
  }

  /**
   * Handle approval state update from plan owner.
   * Validates that the sender is the owner before accepting.
   * Persists to Durable Object storage for hibernation survival.
   *
   * IMPORTANT: Merges approved users from existing state (invite redemptions)
   * to handle race condition where guest redeems before owner connects.
   */
  private async handleApprovalState(ws: WebSocket, message: ApprovalStateMessage): Promise<void> {
    const state = this.getState(ws);

    // IMPORTANT: Infer userId from ownerId to handle race condition where
    // approval_state arrives before subscribe message with userId
    if (!state?.userId && message.ownerId) {
      if (state) {
        state.userId = message.ownerId;
        this.persistState(ws, state);
        logger.info(
          { ownerId: message.ownerId },
          '[handleApprovalState] Inferred userId from ownerId'
        );
      }
    }

    if (!state?.userId) {
      logger.warn('Received approval_state from unauthenticated connection');
      return;
    }

    // Verify sender is the owner
    const existingApproval = this.planApprovals.get(message.planId);
    if (existingApproval && existingApproval.ownerId !== state.userId) {
      logger.warn(
        {
          userId: state.userId,
          existingOwnerId: existingApproval.ownerId,
        },
        'Rejected approval_state: sender is not owner'
      );
      return;
    }

    // For new plans, trust the ownerId in the message (first setter wins)
    if (!existingApproval && message.ownerId !== state.userId) {
      logger.warn(
        {
          userId: state.userId,
          claimedOwnerId: message.ownerId,
        },
        'Rejected approval_state: sender claims to be different owner'
      );
      return;
    }

    // MERGE approved users from existing state (preserves invite redemptions)
    const mergedApprovedUsers = new Set([
      ...message.approvedUsers,
      ...(existingApproval?.approvedUsers ?? []),
    ]);

    // Don't include rejected users in approved list
    const rejectedSet = new Set(message.rejectedUsers);
    const finalApprovedUsers = Array.from(mergedApprovedUsers).filter(
      (user) => !rejectedSet.has(user)
    );

    const approvalState: PlanApprovalState = {
      planId: message.planId,
      ownerId: message.ownerId,
      approvedUsers: finalApprovedUsers,
      rejectedUsers: message.rejectedUsers,
      lastUpdated: Date.now(),
    };

    // Store in memory for fast access
    this.planApprovals.set(message.planId, approvalState);

    // Persist to Durable Object storage (survives hibernation)
    try {
      await this.ctx.storage.put(`approval:${message.planId}`, approvalState);
      logger.info(
        {
          planId: message.planId,
          approvedCount: finalApprovedUsers.length,
          rejectedCount: message.rejectedUsers.length,
        },
        'Persisted approval state for plan'
      );
    } catch (error) {
      logger.error(
        { planId: message.planId, error },
        'Failed to persist approval state for plan'
      );
      // Still keep in memory even if storage fails
    }
  }

  // --- Invite Token Handlers ---

  /**
   * Generate a cryptographically secure invite token.
   * Uses Web Crypto API available in Cloudflare Workers.
   */
  private async generateInviteToken(): Promise<{
    tokenId: string;
    tokenValue: string;
    tokenHash: string;
  }> {
    // Short ID for URL (8 chars from UUID)
    const tokenId = crypto.randomUUID().slice(0, 8);

    // 32 bytes of random data for the secret
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    // Convert to base64url
    const tokenValue = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Hash for storage (never store raw token)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenValue));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return { tokenId, tokenValue, tokenHash };
  }

  /**
   * Verify a token value against a stored hash.
   */
  private async verifyTokenHash(tokenValue: string, storedHash: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(tokenValue));
    const computedHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return computedHash === storedHash;
  }

  /**
   * Handle create_invite message from owner.
   * Creates a new time-limited invite token.
   */
  private async handleCreateInvite(ws: WebSocket, message: CreateInviteRequest): Promise<void> {
    const state = this.getState(ws);
    if (!state?.userId) {
      ws.send(JSON.stringify({ type: 'error', error: 'unauthenticated' }));
      return;
    }

    // Verify sender is owner
    const approval = this.planApprovals.get(message.planId);
    if (!approval || approval.ownerId !== state.userId) {
      ws.send(JSON.stringify({ type: 'error', error: 'not_owner' }));
      return;
    }

    const { tokenId, tokenValue, tokenHash } = await this.generateInviteToken();
    const now = Date.now();
    const ttlMs = (message.ttlMinutes ?? 30) * 60 * 1000;

    const token: InviteToken = {
      id: tokenId,
      tokenHash,
      planId: message.planId,
      createdBy: state.userId,
      createdAt: now,
      expiresAt: now + ttlMs,
      maxUses: message.maxUses ?? null,
      useCount: 0,
      revoked: false,
      label: message.label,
    };

    // Store in memory and persist
    const storageKey = `${message.planId}:${tokenId}`;
    this.inviteTokens.set(storageKey, token);
    await this.ctx.storage.put(`invite:${storageKey}`, token);

    logger.info(
      {
        tokenId,
        planId: message.planId,
        ttlMinutes: message.ttlMinutes ?? 30,
      },
      'Created invite token'
    );

    // Send response with token value (only time it's sent!)
    ws.send(
      JSON.stringify({
        type: 'invite_created',
        tokenId,
        tokenValue, // Only sent once!
        expiresAt: token.expiresAt,
        maxUses: token.maxUses,
        label: token.label,
      })
    );
  }

  /**
   * Handle redeem_invite message from guest.
   * Validates token and auto-approves the user if valid.
   */
  private async handleRedeemInvite(ws: WebSocket, message: RedeemInviteRequest): Promise<void> {
    const { planId, tokenId, tokenValue, userId } = message;
    const storageKey = `${planId}:${tokenId}`;

    // Get token from memory or storage
    let token = this.inviteTokens.get(storageKey);
    if (!token) {
      // Try to load from storage
      token = await this.ctx.storage.get<InviteToken>(`invite:${storageKey}`);
      if (token) {
        this.inviteTokens.set(storageKey, token);
      }
    }

    // Validate token
    const error = await this.validateInviteToken(token, tokenValue, userId);
    if (error || !token) {
      ws.send(
        JSON.stringify({
          type: 'invite_redemption_result',
          success: false,
          error: error || 'invalid',
        })
      );
      return;
    }

    // Check if already redeemed by this user
    const redemptionKey = `redemption:${planId}:${tokenId}:${userId}`;
    const existingRedemption = await this.ctx.storage.get<InviteRedemption>(redemptionKey);
    if (existingRedemption) {
      // Already redeemed - return success (idempotent)
      ws.send(JSON.stringify({ type: 'invite_redemption_result', success: true, planId }));
      return;
    }

    // Increment use count (token is guaranteed non-null here)
    token.useCount++;
    this.inviteTokens.set(storageKey, token);
    await this.ctx.storage.put(`invite:${storageKey}`, token);

    // Record redemption
    const redemption: InviteRedemption = {
      redeemedBy: userId,
      redeemedAt: Date.now(),
      tokenId,
    };
    await this.ctx.storage.put(redemptionKey, redemption);

    // Auto-approve user
    await this.autoApproveUserFromInvite(planId, userId, token);

    logger.info(
      { userId, tokenId, planId },
      'User redeemed invite token'
    );

    // Send success to guest
    ws.send(JSON.stringify({ type: 'invite_redemption_result', success: true, planId }));

    // Notify owner
    this.notifyOwnerOfRedemption(planId, token, userId);
  }

  /**
   * Validate an invite token.
   * Returns error code or null if valid.
   */
  private async validateInviteToken(
    token: InviteToken | undefined,
    tokenValue: string,
    _userId: string
  ): Promise<TokenValidationError | null> {
    if (!token) return 'invalid';
    if (token.revoked) return 'revoked';
    if (Date.now() > token.expiresAt) return 'expired';
    if (token.maxUses !== null && token.useCount >= token.maxUses) return 'exhausted';

    // Verify token hash
    const isValid = await this.verifyTokenHash(tokenValue, token.tokenHash);
    if (!isValid) return 'invalid';

    return null; // Valid
  }

  /**
   * Auto-approve a user after invite redemption.
   * Creates approval state if it doesn't exist (handles race condition).
   */
  private async autoApproveUserFromInvite(
    planId: string,
    userId: string,
    token: InviteToken
  ): Promise<void> {
    let approval = this.planApprovals.get(planId);

    // If no approval state yet, create one from token metadata
    // This handles the race condition where guest arrives before owner
    if (!approval) {
      approval = {
        planId,
        ownerId: token.createdBy,
        approvedUsers: [token.createdBy], // Owner is always approved
        rejectedUsers: [],
        lastUpdated: Date.now(),
      };
    }

    // Add user to approved list if not already present
    if (!approval.approvedUsers.includes(userId)) {
      approval.approvedUsers.push(userId);
      approval.lastUpdated = Date.now();
    }

    // Remove from rejected list if present
    const rejectedIndex = approval.rejectedUsers.indexOf(userId);
    if (rejectedIndex !== -1) {
      approval.rejectedUsers.splice(rejectedIndex, 1);
    }

    // Store in memory and persist
    this.planApprovals.set(planId, approval);
    await this.ctx.storage.put(`approval:${planId}`, approval);
  }

  /**
   * Notify the owner that someone redeemed their invite.
   * Sends notification to all owner's connected WebSockets.
   */
  private notifyOwnerOfRedemption(planId: string, token: InviteToken, redeemedBy: string): void {
    const approval = this.planApprovals.get(planId);
    if (!approval) return;

    const notification = JSON.stringify({
      type: 'invite_redeemed',
      planId,
      tokenId: token.id,
      label: token.label,
      redeemedBy,
      useCount: token.useCount,
      maxUses: token.maxUses,
    });

    // Find owner's connections and send notification
    const topic = `peer-plan-${planId}`;
    const subscribers = this.topics.get(topic);
    if (!subscribers) return;

    for (const ws of subscribers) {
      const state = this.getState(ws);
      if (state?.userId === approval.ownerId) {
        try {
          ws.send(notification);
        } catch {
          // Connection may be dead
        }
      }
    }
  }

  /**
   * Handle revoke_invite message from owner.
   * Marks the invite as revoked (prevents future redemptions).
   */
  private async handleRevokeInvite(ws: WebSocket, message: RevokeInviteRequest): Promise<void> {
    const state = this.getState(ws);
    if (!state?.userId) {
      ws.send(JSON.stringify({ type: 'invite_revoked', tokenId: message.tokenId, success: false }));
      return;
    }

    // Verify sender is owner
    const approval = this.planApprovals.get(message.planId);
    if (!approval || approval.ownerId !== state.userId) {
      ws.send(JSON.stringify({ type: 'invite_revoked', tokenId: message.tokenId, success: false }));
      return;
    }

    const storageKey = `${message.planId}:${message.tokenId}`;
    const token = this.inviteTokens.get(storageKey);
    if (!token) {
      ws.send(JSON.stringify({ type: 'invite_revoked', tokenId: message.tokenId, success: false }));
      return;
    }

    // Mark as revoked
    token.revoked = true;
    this.inviteTokens.set(storageKey, token);
    await this.ctx.storage.put(`invite:${storageKey}`, token);

    logger.info(
      { tokenId: message.tokenId, planId: message.planId },
      'Revoked invite token'
    );

    ws.send(JSON.stringify({ type: 'invite_revoked', tokenId: message.tokenId, success: true }));
  }

  /**
   * Handle list_invites message from owner.
   * Returns list of active (non-expired, non-revoked) invites.
   */
  private async handleListInvites(ws: WebSocket, message: ListInvitesRequest): Promise<void> {
    const state = this.getState(ws);
    if (!state?.userId) {
      ws.send(JSON.stringify({ type: 'invites_list', planId: message.planId, invites: [] }));
      return;
    }

    // Verify sender is owner
    const approval = this.planApprovals.get(message.planId);
    if (!approval || approval.ownerId !== state.userId) {
      ws.send(JSON.stringify({ type: 'invites_list', planId: message.planId, invites: [] }));
      return;
    }

    const now = Date.now();
    const invites: Array<{
      tokenId: string;
      label?: string;
      expiresAt: number;
      maxUses: number | null;
      useCount: number;
      createdAt: number;
    }> = [];

    // Collect active invites for this plan
    for (const [key, token] of this.inviteTokens.entries()) {
      if (!key.startsWith(`${message.planId}:`)) continue;
      if (token.revoked || token.expiresAt < now) continue;
      if (token.maxUses !== null && token.useCount >= token.maxUses) continue;

      invites.push({
        tokenId: token.id,
        label: token.label,
        expiresAt: token.expiresAt,
        maxUses: token.maxUses,
        useCount: token.useCount,
        createdAt: token.createdAt,
      });
    }

    ws.send(JSON.stringify({ type: 'invites_list', planId: message.planId, invites }));
  }

  /**
   * Handle WebSocket close (client disconnected)
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    this.cleanupConnection(ws);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    logger.error({ error }, 'WebSocket error');
    this.cleanupConnection(ws);
  }

  /**
   * Clean up a connection from all topics
   */
  private cleanupConnection(ws: WebSocket): void {
    const state = this.getState(ws);
    if (!state) return;

    // Remove from all subscribed topics
    for (const topic of state.topics) {
      const subscribers = this.topics.get(topic);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.topics.delete(topic);
        }
      }
    }
  }

  /**
   * Get connection state from WebSocket
   */
  private getState(ws: WebSocket): ConnectionState | null {
    // First check in-memory state
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
   * Persist connection state for hibernation survival
   */
  private persistState(ws: WebSocket, state: ConnectionState): void {
    ws.serializeAttachment({
      id: state.id,
      topics: Array.from(state.topics),
      userId: state.userId,
    } satisfies SerializedConnectionState);
  }
}
