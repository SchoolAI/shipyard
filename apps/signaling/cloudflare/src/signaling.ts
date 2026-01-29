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
 *
 * WebSocket Hibernation allows the DO to sleep while connections remain open,
 * dramatically reducing costs for idle connections.
 *
 * Note: This is a simple pub/sub relay - no authentication or approval checking.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  checkAuthDeadlines,
  handleAuthenticate,
  handleCreateInvite,
  handleListInvites,
  handlePublish,
  handleRedeemInvite,
  handleRevokeInvite,
  handleSubscribe,
  handleUnsubscribe,
  handleValidateEpoch,
} from '@signaling/handlers/index.js';
import type { SignalingMessage } from '@signaling/types.js';
import { CloudflarePlatformAdapter } from './adapter.js';
import { logger } from './logger.js';

/** Check for expired auth deadlines every 5 seconds */
const AUTH_DEADLINE_CHECK_INTERVAL_MS = 5000;

/**
 * Minimum epoch for this server.
 * TODO: Move to environment variable in wrangler.toml
 * CRITICAL: Must match registry server's MINIMUM_EPOCH value
 */
const MINIMUM_EPOCH = 2;

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

    /*
     * Initialize adapter with blockConcurrencyWhile to ensure
     * all state is restored before handling any messages.
     * This prevents race conditions where a message arrives
     * before initialization completes.
     */
    ctx.blockConcurrencyWhile(async () => {
      await this.adapter.initialize();
      await this.scheduleAuthDeadlineCheck();
    });
  }

  /**
   * Schedule the next auth deadline check alarm.
   * Only schedules if there isn't already an alarm set.
   */
  private async scheduleAuthDeadlineCheck(): Promise<void> {
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (existingAlarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + AUTH_DEADLINE_CHECK_INTERVAL_MS);
    }
  }

  /**
   * Handle alarm for periodic auth deadline checks.
   * This is hibernation-friendly: the DO wakes up, checks deadlines, then can hibernate again.
   */
  async alarm(): Promise<void> {
    const disconnected = checkAuthDeadlines(this.adapter, (ws) => {
      /** Check if this is a WebSocket-like object with a close method */
      if (ws && typeof ws === 'object' && 'close' in ws && typeof ws.close === 'function') {
        try {
          ws.close(1008, 'Authentication timeout');
        } catch {
          /** Connection may already be closed */
        }
      }
    });

    if (disconnected > 0) {
      logger.info({ count: disconnected }, 'Disconnected connections due to auth timeout');
    }

    await this.ctx.storage.setAlarm(Date.now() + AUTH_DEADLINE_CHECK_INTERVAL_MS);
  }

  /**
   * Handle incoming HTTP requests (WebSocket upgrades)
   */
  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    /** NOTE: Hibernation support enables DO to sleep while keeping connections open */
    this.ctx.acceptWebSocket(server);

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
    /** NOTE: Adapter initialized in constructor with blockConcurrencyWhile (runs on hibernation wake) */

    try {
      const data: SignalingMessage = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message)
      );

      switch (data.type) {
        case 'subscribe':
          handleSubscribe(this.adapter, ws, data, MINIMUM_EPOCH);
          break;

        case 'unsubscribe':
          handleUnsubscribe(this.adapter, ws, data);
          break;

        case 'publish':
          handlePublish(this.adapter, ws, data);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'validate_epoch':
          handleValidateEpoch(this.adapter, ws, data, MINIMUM_EPOCH);
          break;

        case 'authenticate':
          await handleAuthenticate(this.adapter, ws, data);
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
          /** Exhaustive check - TypeScript will error if we miss a case */
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
    /** Adapter is initialized via blockConcurrencyWhile in constructor */
    this.adapter.unsubscribeFromAllTopics(ws);
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    logger.error({ error }, 'WebSocket error');
    /** Adapter is initialized via blockConcurrencyWhile in constructor */
    this.adapter.unsubscribeFromAllTopics(ws);
  }
}
