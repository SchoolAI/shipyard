/**
 * Durable Object for y-webrtc signaling with WebSocket Hibernation
 *
 * This is a thin wrapper that uses the platform-agnostic core handlers
 * with the Cloudflare-specific adapter. All business logic is in core/handlers/.
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
import type { SignalingMessage } from '../../core/types.js';
import {
  handleApprovalState,
  handleCreateInvite,
  handleListInvites,
  handlePublish,
  handleRedeemInvite,
  handleRevokeInvite,
  handleSubscribe,
  handleUnsubscribe,
} from '../../core/handlers/index.js';
import { CloudflarePlatformAdapter } from './adapter.js';
import { logger } from './logger.js';

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
}

export class SignalingRoom extends DurableObject<Env> {
  /**
   * Platform adapter for core handlers.
   * Created lazily and reused across requests.
   */
  private adapter: CloudflarePlatformAdapter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.adapter = new CloudflarePlatformAdapter(ctx);

    // Initialize adapter with blockConcurrencyWhile to ensure
    // all state is restored before handling any messages.
    // This prevents race conditions where a message arrives
    // before initialization completes.
    ctx.blockConcurrencyWhile(async () => {
      await this.adapter.initialize();
    });
  }

  /**
   * Handle incoming HTTP requests (WebSocket upgrades)
   */
  async fetch(request: Request): Promise<Response> {
    // Adapter is already initialized via blockConcurrencyWhile in constructor

    // Create the WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket with hibernation support
    // This tells the runtime this connection can hibernate
    this.ctx.acceptWebSocket(server);

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
    // Adapter is initialized via blockConcurrencyWhile in constructor
    // which also runs on hibernation wake

    try {
      const data: SignalingMessage = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message)
      );

      // Handle each message type with exhaustive switch
      // All handlers use the platform adapter for storage/messaging
      switch (data.type) {
        case 'subscribe':
          handleSubscribe(this.adapter, ws, data);
          break;

        case 'unsubscribe':
          handleUnsubscribe(this.adapter, ws, data);
          break;

        case 'publish':
          await handlePublish(this.adapter, ws, data);
          break;

        case 'ping':
          // Handled by setWebSocketAutoResponse, but just in case
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'approval_state':
          await handleApprovalState(this.adapter, ws, data);
          break;

        case 'create_invite':
          await handleCreateInvite(this.adapter, ws, data);
          break;

        case 'redeem_invite':
          await handleRedeemInvite(this.adapter, ws, data);
          break;

        case 'revoke_invite':
          await handleRevokeInvite(this.adapter, ws, data);
          break;

        case 'list_invites':
          await handleListInvites(this.adapter, ws, data);
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
   * Handle WebSocket close (client disconnected)
   */
  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // Adapter is initialized via blockConcurrencyWhile in constructor
    this.adapter.unsubscribeFromAllTopics(ws);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    logger.error({ error }, 'WebSocket error');
    // Adapter is initialized via blockConcurrencyWhile in constructor
    this.adapter.unsubscribeFromAllTopics(ws);
  }
}
