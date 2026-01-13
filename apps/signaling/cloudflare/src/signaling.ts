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

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
}

// Message types from y-webrtc signaling protocol
interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
  userId?: string; // GitHub username for approval checking
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  topics: string[];
}

interface PublishMessage {
  type: 'publish';
  topic: string;
  from?: string; // y-webrtc client ID (not user ID)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // y-webrtc adds various fields (to, signal, etc.)
}

interface PingMessage {
  type: 'ping';
}

// Approval state message from plan owner
interface ApprovalStateMessage {
  type: 'approval_state';
  planId: string;
  ownerId: string;
  approvedUsers: string[];
  rejectedUsers: string[];
}

type SignalingMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | PublishMessage
  | PingMessage
  | ApprovalStateMessage;

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

// Plan approval state (stored per plan)
interface PlanApprovalState {
  planId: string;
  ownerId: string;
  approvedUsers: string[];
  rejectedUsers: string[];
  lastUpdated: number;
}

export class SignalingRoom extends DurableObject<Env> {
  // In-memory topic -> WebSocket mapping (rebuilt on wake from hibernation)
  private topics: Map<string, Set<WebSocket>> = new Map();

  // Plan approval state: planId -> approval state
  // Cached in memory for fast access, persisted to storage for hibernation survival
  private planApprovals: Map<string, PlanApprovalState> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore state from hibernated WebSockets
    // This runs both on first creation AND when waking from hibernation
    this.restoreFromHibernation();

    // Restore approval state from storage (async, but fast)
    this.restoreApprovalState();
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
      console.log(`Restored ${stored.size} approval states from storage`);
    } catch (error) {
      console.error('Failed to restore approval state:', error);
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
      }
    } catch (error) {
      console.error('Error handling message:', error);
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
      console.log(`[isUserApproved] No approval state for plan ${planId}, denying access`);
      return false;
    }

    // No user ID - DENY (must authenticate to access plans)
    // This prevents unauthenticated users from syncing plan data
    if (!userId) {
      console.log(`[isUserApproved] No userId provided for plan ${planId}, denying access`);
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
   */
  private async handleApprovalState(ws: WebSocket, message: ApprovalStateMessage): Promise<void> {
    const state = this.getState(ws);
    if (!state?.userId) {
      console.warn('Received approval_state from unauthenticated connection');
      return;
    }

    // Verify sender is the owner
    const existingApproval = this.planApprovals.get(message.planId);
    if (existingApproval && existingApproval.ownerId !== state.userId) {
      console.warn(
        `Rejected approval_state: sender ${state.userId} is not owner ${existingApproval.ownerId}`
      );
      return;
    }

    // For new plans, trust the ownerId in the message (first setter wins)
    if (!existingApproval && message.ownerId !== state.userId) {
      console.warn(
        `Rejected approval_state: sender ${state.userId} claims to be owner ${message.ownerId}`
      );
      return;
    }

    const approvalState: PlanApprovalState = {
      planId: message.planId,
      ownerId: message.ownerId,
      approvedUsers: message.approvedUsers,
      rejectedUsers: message.rejectedUsers,
      lastUpdated: Date.now(),
    };

    // Store in memory for fast access
    this.planApprovals.set(message.planId, approvalState);

    // Persist to Durable Object storage (survives hibernation)
    try {
      await this.ctx.storage.put(`approval:${message.planId}`, approvalState);
      console.log(
        `Persisted approval state for plan ${message.planId}: ${message.approvedUsers.length} approved, ${message.rejectedUsers.length} rejected`
      );
    } catch (error) {
      console.error(`Failed to persist approval state for plan ${message.planId}:`, error);
      // Still keep in memory even if storage fails
    }
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
    console.error('WebSocket error:', error);
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
