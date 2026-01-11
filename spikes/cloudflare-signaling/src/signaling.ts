/**
 * Durable Object for y-webrtc signaling with WebSocket Hibernation
 *
 * Implements the y-webrtc signaling protocol:
 * - subscribe: Client subscribes to room topics (plan IDs)
 * - unsubscribe: Client leaves room topics
 * - publish: Broadcast message to all subscribers of a topic
 * - ping/pong: Keepalive (handled automatically via hibernation API)
 *
 * WebSocket Hibernation allows the DO to sleep while connections remain open,
 * dramatically reducing costs for idle connections.
 */

import { DurableObject } from 'cloudflare:workers';

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
}

// Message types from y-webrtc signaling protocol
interface SubscribeMessage {
  type: 'subscribe';
  topics: string[];
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  topics: string[];
}

interface PublishMessage {
  type: 'publish';
  topic: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // y-webrtc adds various fields (from, to, signal, etc.)
}

interface PingMessage {
  type: 'ping';
}

type SignalingMessage = SubscribeMessage | UnsubscribeMessage | PublishMessage | PingMessage;

// Per-connection state stored as WebSocket attachment
interface ConnectionState {
  id: string;
  topics: Set<string>;
}

// Serialized form for WebSocket attachment (Sets can't be serialized)
interface SerializedConnectionState {
  id: string;
  topics: string[];
}

export class SignalingRoom extends DurableObject<Env> {
  // In-memory topic -> WebSocket mapping (rebuilt on wake from hibernation)
  private topics: Map<string, Set<WebSocket>> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore state from hibernated WebSockets
    // This runs both on first creation AND when waking from hibernation
    this.restoreFromHibernation();
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
        };

        // Rebuild topic -> WebSocket mapping
        for (const topic of state.topics) {
          if (!this.topics.has(topic)) {
            this.topics.set(topic, new Set());
          }
          this.topics.get(topic)!.add(ws);
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

    for (const topic of message.topics || []) {
      if (typeof topic !== 'string') continue;

      // Add to topic map
      if (!this.topics.has(topic)) {
        this.topics.set(topic, new Set());
      }
      this.topics.get(topic)!.add(ws);

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
   * Handle publish (broadcast to topic subscribers)
   * This is the main signaling message for WebRTC offer/answer/ICE
   */
  private handlePublish(ws: WebSocket, message: PublishMessage): void {
    if (!message.topic) return;

    const subscribers = this.topics.get(message.topic);
    if (!subscribers) return;

    // Add client count to message (y-webrtc uses this)
    const outMessage = JSON.stringify({
      ...message,
      clients: subscribers.size,
    });

    // Broadcast to all subscribers in the topic
    for (const subscriber of subscribers) {
      try {
        subscriber.send(outMessage);
      } catch {
        // Connection may be dead, will be cleaned up on close
      }
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
    } satisfies SerializedConnectionState);
  }
}
