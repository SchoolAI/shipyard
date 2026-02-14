/**
 * CollabRoom Durable Object.
 *
 * Ad-hoc room for shared task sessions with multiple participants.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  type CollabRoomClientMessage,
  CollabRoomClientMessageSchema,
  type CollabRoomServerMessage,
} from '@shipyard/session';
import type { Env } from '../env';
import { broadcastExcept, findWebSocketByUserId } from '../protocol/webrtc-relay';
import { createLogger, type Logger } from '../utils/logger';
import type { PassedCollabPayload, SerializedCollabConnectionState } from './types';

function assertNever(x: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(x)}`);
}

/** Connection state for each WebSocket */
interface ConnectionState {
  id: string;
  userId: string;
  username: string;
  role: 'owner' | 'collaborator';
}

export class CollabRoom extends DurableObject<Env> {
  private participants: Map<WebSocket, ConnectionState> = new Map();
  private taskId: string | null = null;
  private ownerId: string | null = null;
  private expiresAt: number | null = null;
  private logger: Logger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(env).child({ do: 'CollabRoom' });

    ctx.blockConcurrencyWhile(async () => {
      await this.initialize();
    });
  }

  /**
   * Initialize state from storage.
   */
  private async initialize(): Promise<void> {
    const metadata = await this.ctx.storage.get<{
      taskId: string;
      ownerId: string;
      expiresAt: number;
    }>('metadata');

    if (metadata) {
      this.taskId = metadata.taskId;
      this.ownerId = metadata.ownerId;
      this.expiresAt = metadata.expiresAt;
    }

    const websockets = this.ctx.getWebSockets();
    for (const ws of websockets) {
      const attachment: unknown = ws.deserializeAttachment();
      if (this.isValidConnectionState(attachment)) {
        this.participants.set(ws, {
          id: attachment.id,
          userId: attachment.userId,
          username: attachment.username,
          role: attachment.role,
        });
      }
    }
  }

  /**
   * Handle incoming HTTP/WebSocket request.
   */
  override async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const payloadHeader = request.headers.get('X-Shipyard-Collab-Payload');
    if (!payloadHeader) {
      return new Response('Missing collab payload', { status: 401 });
    }

    let payload: PassedCollabPayload;
    try {
      payload = JSON.parse(payloadHeader);
    } catch {
      return new Response('Invalid collab payload', { status: 401 });
    }

    if (Date.now() > payload.exp) {
      return new Response('Collaboration link expired', { status: 401 });
    }

    if (!this.taskId) {
      this.taskId = payload.taskId;
      this.ownerId = payload.inviterId;
      this.expiresAt = payload.exp;

      await this.ctx.storage.put('metadata', {
        taskId: this.taskId,
        ownerId: this.ownerId,
        expiresAt: this.expiresAt,
      });

      await this.ctx.storage.setAlarm(payload.exp);
    }

    const userId = payload.userClaims?.sub ?? payload.inviterId;
    const username = payload.userClaims?.ghUser ?? 'anonymous';
    const role: 'owner' | 'collaborator' = userId === this.ownerId ? 'owner' : 'collaborator';

    const pair = new WebSocketPair();
    const values = Object.values(pair);
    const client = values[0];
    const server = values[1];
    if (!client || !server) {
      return new Response('WebSocket pair creation failed', { status: 500 });
    }

    const state: ConnectionState = {
      id: crypto.randomUUID(),
      userId,
      username,
      role,
    };

    this.ctx.acceptWebSocket(server);
    this.participants.set(server, state);
    this.persistConnectionState(server, state);

    this.sendMessage(server, {
      type: 'authenticated',
      userId,
      username,
      taskId: this.taskId,
    });

    this.sendMessage(server, {
      type: 'participants-list',
      participants: Array.from(this.participants.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        role: p.role,
      })),
    });

    broadcastExcept(
      this.participants,
      {
        type: 'participant-joined',
        participant: { userId, username, role },
      } satisfies CollabRoomServerMessage,
      server
    );

    this.logger.info('Participant joined', { userId, role });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * WebSocket message handler (hibernation-aware).
   */
  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const state = this.participants.get(ws);
    if (!state) {
      this.logger.warn('Message from unknown connection');
      return;
    }

    let msgStr: string;
    if (message instanceof ArrayBuffer) {
      msgStr = new TextDecoder().decode(message);
    } else {
      msgStr = message;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(msgStr);
    } catch {
      this.sendError(ws, 'invalid_json', 'Invalid JSON message');
      return;
    }

    const result = CollabRoomClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.sendError(ws, 'invalid_message', 'Invalid message format');
      return;
    }

    await this.handleMessage(ws, state, result.data);
  }

  /**
   * WebSocket close handler.
   */
  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const state = this.participants.get(ws);
    if (!state) return;

    this.logger.info('Participant left', {
      userId: state.userId,
      code,
      reason,
    });

    this.participants.delete(ws);

    broadcastExcept(this.participants, {
      type: 'participant-left',
      userId: state.userId,
    } satisfies CollabRoomServerMessage);
  }

  /**
   * WebSocket error handler.
   */
  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.logger.error('WebSocket error', { error: String(error) });
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }

  /**
   * Alarm handler for room expiration.
   */
  override async alarm(): Promise<void> {
    this.logger.info('Room expired, closing connections');

    for (const ws of this.participants.keys()) {
      try {
        ws.close(1000, 'Room expired');
      } catch {
        // NOTE: Swallowing error intentionally - connection may already be closed
      }
    }

    this.participants.clear();

    await this.ctx.storage.deleteAll();
  }

  private async handleMessage(
    ws: WebSocket,
    state: ConnectionState,
    msg: CollabRoomClientMessage
  ): Promise<void> {
    switch (msg.type) {
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice':
        this.handleWebRTCRelay(ws, state, msg);
        break;
      default:
        assertNever(msg);
    }
  }

  private handleWebRTCRelay(
    ws: WebSocket,
    state: ConnectionState,
    msg: CollabRoomClientMessage
  ): void {
    const targetUserId = msg.targetUserId;

    const targetWs = findWebSocketByUserId(this.participants, targetUserId);

    if (!targetWs) {
      this.sendError(ws, 'target_not_found', `Target user ${targetUserId} not connected`);
      return;
    }

    const relayMsg = {
      ...msg,
      targetUserId: state.userId,
    } satisfies CollabRoomServerMessage;

    try {
      targetWs.send(JSON.stringify(relayMsg));
    } catch {
      // NOTE: Swallowing error intentionally - connection may already be closed
    }

    this.logger.debug('WebRTC message relayed', {
      type: msg.type,
      from: state.userId,
      to: targetUserId,
    });
  }

  private sendMessage(ws: WebSocket, msg: CollabRoomServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // NOTE: Swallowing error intentionally - connection may already be closed
    }
  }

  private sendError(ws: WebSocket, code: string, message: string, requestId?: string): void {
    this.sendMessage(ws, { type: 'error', code, message, requestId });
  }

  private persistConnectionState(ws: WebSocket, state: ConnectionState): void {
    const serialized: SerializedCollabConnectionState = {
      id: state.id,
      userId: state.userId,
      username: state.username,
      role: state.role,
    };
    ws.serializeAttachment(serialized);
  }

  private isValidConnectionState(obj: unknown): obj is SerializedCollabConnectionState {
    if (!obj || typeof obj !== 'object') return false;
    return (
      'id' in obj &&
      typeof obj.id === 'string' &&
      'userId' in obj &&
      typeof obj.userId === 'string' &&
      'username' in obj &&
      typeof obj.username === 'string' &&
      'role' in obj &&
      (obj.role === 'owner' || obj.role === 'collaborator')
    );
  }
}
