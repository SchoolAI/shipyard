/**
 * PersonalRoom Durable Object.
 *
 * One per user - handles agent registry and browser↔daemon WebRTC signaling.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  type PersonalRoomClientMessage,
  PersonalRoomClientMessageSchema,
  type PersonalRoomServerMessage,
} from '@shipyard/session';
import type { Env } from '../env';
import { broadcastExcept, findWebSocketByMachineId, relayMessage } from '../protocol/webrtc-relay';
import { createLogger, type Logger } from '../utils/logger';
import {
  type AgentInfo,
  type PassedClaims,
  PassedClaimsSchema,
  type PersonalConnectionType,
  type SerializedPersonalConnectionState,
} from './types';

function assertNever(x: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(x)}`);
}

/** Connection state for each WebSocket */
interface ConnectionState {
  id: string;
  type: PersonalConnectionType;
  userId: string;
  username: string;
  machineId?: string;
  agentId?: string;
  sessionId?: string;
}

export class PersonalRoom extends DurableObject<Env> {
  private agents: Record<string, AgentInfo> = {};
  private connections: Map<WebSocket, ConnectionState> = new Map();
  private logger: Logger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = createLogger(env).child({ do: 'PersonalRoom' });

    ctx.blockConcurrencyWhile(async () => {
      await this.initialize();
    });
  }

  /**
   * Initialize state from storage.
   *
   * After restoring WebSocket connections, prune any agents from storage
   * that no longer have a live WebSocket. This handles the case where the
   * DO reinitializes (e.g. wrangler dev restart) and the old agent
   * processes are gone but their entries survived in SQLite-backed storage.
   */
  private async initialize(): Promise<void> {
    const storedAgents = await this.ctx.storage.get<Record<string, AgentInfo>>('agents');
    if (storedAgents) {
      this.agents = storedAgents;
    }

    const websockets = this.ctx.getWebSockets();
    for (const ws of websockets) {
      const attachment: unknown = ws.deserializeAttachment();
      if (this.isValidConnectionState(attachment)) {
        this.connections.set(ws, {
          id: attachment.id,
          type: attachment.type,
          userId: attachment.userId,
          username: attachment.username,
          machineId: attachment.machineId,
          agentId: attachment.agentId,
          sessionId: attachment.sessionId,
        });
      }
    }

    const connectedAgentIds = new Set<string>();
    for (const state of this.connections.values()) {
      if (state.agentId) {
        connectedAgentIds.add(state.agentId);
      }
    }

    let cleaned = false;
    for (const agentId of Object.keys(this.agents)) {
      if (!connectedAgentIds.has(agentId)) {
        delete this.agents[agentId];
        cleaned = true;
        this.logger.info('Pruned stale agent on initialization', { agentId });
      }
    }

    if (cleaned) {
      await this.ctx.storage.put('agents', this.agents);
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

    const claimsHeader = request.headers.get('X-Shipyard-Claims');
    if (!claimsHeader) {
      return new Response('Missing claims', { status: 401 });
    }

    let claims: PassedClaims;
    try {
      const parsed: unknown = JSON.parse(claimsHeader);
      const result = PassedClaimsSchema.safeParse(parsed);
      if (!result.success) {
        return new Response('Invalid claims', { status: 401 });
      }
      claims = result.data;
    } catch {
      return new Response('Invalid claims', { status: 401 });
    }

    const pair = new WebSocketPair();
    const values = Object.values(pair);
    const client = values[0];
    const server = values[1];
    if (!client || !server) {
      return new Response('WebSocket pair creation failed', { status: 500 });
    }

    const url = new URL(request.url);
    const clientType = url.searchParams.get('clientType');
    const type: PersonalConnectionType = clientType === 'agent' ? 'agent' : 'browser';

    const state: ConnectionState = {
      id: crypto.randomUUID(),
      type,
      userId: claims.sub,
      username: claims.ghUser,
    };

    if (type === 'browser') {
      state.sessionId = crypto.randomUUID();
    }

    this.ctx.acceptWebSocket(server);
    this.connections.set(server, state);
    this.persistConnectionState(server, state);

    this.sendMessage(server, {
      type: 'authenticated',
      userId: claims.sub,
      username: claims.ghUser,
    });

    this.sendMessage(server, {
      type: 'agents-list',
      agents: Object.values(this.agents),
    });

    this.logger.info('Connection accepted', { type, userId: claims.sub });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * WebSocket message handler (hibernation-aware).
   */
  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const state = this.connections.get(ws);
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

    const result = PersonalRoomClientMessageSchema.safeParse(parsed);
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
    const state = this.connections.get(ws);
    if (!state) return;

    this.logger.info('Connection closed', { type: state.type, code, reason });

    if (state.type === 'agent' && state.agentId) {
      delete this.agents[state.agentId];
      await this.ctx.storage.put('agents', this.agents);

      broadcastExcept(
        this.connections,
        {
          type: 'agent-left',
          agentId: state.agentId,
        } satisfies PersonalRoomServerMessage,
        ws
      );
    }

    this.connections.delete(ws);
  }

  /**
   * WebSocket error handler.
   */
  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.logger.error('WebSocket error', { error: String(error) });
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }

  private async handleMessage(
    ws: WebSocket,
    state: ConnectionState,
    msg: PersonalRoomClientMessage
  ): Promise<void> {
    switch (msg.type) {
      case 'register-agent':
        await this.handleRegisterAgent(ws, state, msg);
        break;
      case 'unregister-agent':
        await this.handleUnregisterAgent(ws, state, msg);
        break;
      case 'agent-status':
        await this.handleAgentStatus(ws, state, msg);
        break;
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice':
        this.handleWebRTCRelay(ws, state, msg);
        break;
      case 'notify-task':
        this.handleNotifyTask(ws, state, msg);
        break;
      case 'task-ack':
        this.handleTaskAck(ws, state, msg);
        break;
      case 'update-capabilities':
        await this.handleUpdateCapabilities(ws, state, msg);
        break;
      default:
        assertNever(msg);
    }
  }

  private async handleRegisterAgent(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<PersonalRoomClientMessage, { type: 'register-agent' }>
  ): Promise<void> {
    if (state.type !== 'agent') {
      this.sendError(ws, 'forbidden', 'Only agent connections can register');
      return;
    }

    const isReregistration = msg.agentId in this.agents;

    if (isReregistration) {
      for (const [existingWs, existingState] of this.connections) {
        if (existingState.agentId === msg.agentId && existingWs !== ws) {
          existingState.agentId = undefined;
          existingState.machineId = undefined;
          this.persistConnectionState(existingWs, existingState);
        }
      }
    }

    state.agentId = msg.agentId;
    state.machineId = msg.machineId;
    this.persistConnectionState(ws, state);

    const now = Date.now();
    const agentInfo: AgentInfo = {
      agentId: msg.agentId,
      machineId: msg.machineId,
      machineName: msg.machineName,
      agentType: msg.agentType,
      status: 'idle',
      ...(msg.capabilities && { capabilities: msg.capabilities }),
      registeredAt: isReregistration ? (this.agents[msg.agentId]?.registeredAt ?? now) : now,
      lastSeenAt: now,
    };

    this.agents[msg.agentId] = agentInfo;
    await this.ctx.storage.put('agents', this.agents);

    broadcastExcept(
      this.connections,
      {
        type: 'agent-joined',
        agent: agentInfo,
      } satisfies PersonalRoomServerMessage,
      ws
    );

    this.logger.info(isReregistration ? 'Agent re-registered' : 'Agent registered', {
      agentId: msg.agentId,
      machineId: msg.machineId,
    });
  }

  private async handleUnregisterAgent(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<PersonalRoomClientMessage, { type: 'unregister-agent' }>
  ): Promise<void> {
    if (state.agentId !== msg.agentId) {
      this.sendError(ws, 'forbidden', 'Cannot unregister another agent');
      return;
    }

    if (!this.agents[msg.agentId]) {
      this.sendError(ws, 'not_found', `Agent ${msg.agentId} not found`);
      return;
    }

    delete this.agents[msg.agentId];
    await this.ctx.storage.put('agents', this.agents);

    if (state.agentId === msg.agentId) {
      state.agentId = undefined;
      state.machineId = undefined;
      this.persistConnectionState(ws, state);
    }

    broadcastExcept(
      this.connections,
      {
        type: 'agent-left',
        agentId: msg.agentId,
      } satisfies PersonalRoomServerMessage,
      ws
    );

    this.logger.info('Agent unregistered', { agentId: msg.agentId });
  }

  private async handleAgentStatus(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<PersonalRoomClientMessage, { type: 'agent-status' }>
  ): Promise<void> {
    if (state.agentId !== msg.agentId) {
      this.sendError(ws, 'forbidden', 'Cannot update status for another agent');
      return;
    }

    const agent = this.agents[msg.agentId];
    if (!agent) {
      this.sendError(ws, 'not_found', `Agent ${msg.agentId} not found`);
      return;
    }

    agent.status = msg.status;
    agent.activeTaskId = msg.activeTaskId;
    agent.lastSeenAt = Date.now();
    await this.ctx.storage.put('agents', this.agents);

    broadcastExcept(
      this.connections,
      {
        type: 'agent-status-changed',
        agentId: msg.agentId,
        status: msg.status,
        activeTaskId: msg.activeTaskId,
      } satisfies PersonalRoomServerMessage,
      ws
    );

    this.logger.debug('Agent status updated', {
      agentId: msg.agentId,
      status: msg.status,
    });
  }

  private async handleUpdateCapabilities(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<PersonalRoomClientMessage, { type: 'update-capabilities' }>
  ): Promise<void> {
    if (state.agentId !== msg.agentId) {
      this.sendError(ws, 'forbidden', 'Cannot update capabilities for another agent');
      return;
    }

    const agent = this.agents[msg.agentId];
    if (!agent) {
      this.sendError(ws, 'not_found', `Agent ${msg.agentId} not found`);
      return;
    }

    agent.capabilities = msg.capabilities;
    agent.lastSeenAt = Date.now();
    await this.ctx.storage.put('agents', this.agents);

    broadcastExcept(
      this.connections,
      {
        type: 'agent-capabilities-changed',
        agentId: msg.agentId,
        capabilities: msg.capabilities,
      } satisfies PersonalRoomServerMessage,
      ws
    );

    this.logger.debug('Agent capabilities updated', {
      agentId: msg.agentId,
    });
  }

  private handleWebRTCRelay(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<
      PersonalRoomClientMessage,
      { type: 'webrtc-offer' | 'webrtc-answer' | 'webrtc-ice' }
    >
  ): void {
    const targetWs = findWebSocketByMachineId(this.connections, msg.targetMachineId);

    if (!targetWs) {
      this.sendError(
        ws,
        'target_not_found',
        `Target machine ${msg.targetMachineId} not connected`,
        'requestId' in msg ? msg.requestId : undefined
      );
      return;
    }

    const fromMachineId = state.machineId ?? state.id;
    const relayMsg: PersonalRoomServerMessage = {
      ...msg,
      fromMachineId,
    };

    relayMessage(targetWs, relayMsg);

    this.logger.debug('WebRTC message relayed', {
      type: msg.type,
      from: fromMachineId,
      to: msg.targetMachineId,
    });
  }

  private handleNotifyTask(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<PersonalRoomClientMessage, { type: 'notify-task' }>
  ): void {
    if (state.type !== 'browser') {
      this.sendError(ws, 'forbidden', 'Only browser connections can notify tasks');
      return;
    }

    const daemonWs = findWebSocketByMachineId(this.connections, msg.machineId);

    if (!daemonWs) {
      this.sendMessage(ws, {
        type: 'task-ack',
        requestId: msg.requestId,
        taskId: msg.taskId,
        accepted: false,
        error: `Daemon on machine ${msg.machineId} not connected`,
      });
      return;
    }

    relayMessage(daemonWs, msg);

    this.logger.info('Task notification forwarded to daemon', {
      requestId: msg.requestId,
      machineId: msg.machineId,
      taskId: msg.taskId,
    });
  }

  private handleTaskAck(
    ws: WebSocket,
    state: ConnectionState,
    msg: Extract<PersonalRoomClientMessage, { type: 'task-ack' }>
  ): void {
    if (state.type !== 'agent') {
      this.sendError(ws, 'forbidden', 'Only agent connections can send task acknowledgments');
      return;
    }

    for (const [connWs, connState] of this.connections) {
      if (connState.type === 'browser') {
        this.sendMessage(connWs, msg);
      }
    }

    this.logger.info('Task ack relayed to browsers', {
      requestId: msg.requestId,
      taskId: msg.taskId,
      accepted: msg.accepted,
    });
  }

  private sendMessage(ws: WebSocket, msg: PersonalRoomServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  private sendError(ws: WebSocket, code: string, message: string, requestId?: string): void {
    this.sendMessage(ws, { type: 'error', code, message, requestId });
  }

  private persistConnectionState(ws: WebSocket, state: ConnectionState): void {
    const serialized: SerializedPersonalConnectionState = {
      id: state.id,
      type: state.type,
      userId: state.userId,
      username: state.username,
      machineId: state.machineId,
      agentId: state.agentId,
      sessionId: state.sessionId,
    };
    ws.serializeAttachment(serialized);
  }

  private isValidConnectionState(obj: unknown): obj is SerializedPersonalConnectionState {
    if (!obj || typeof obj !== 'object') return false;
    return (
      'id' in obj &&
      typeof obj.id === 'string' &&
      'type' in obj &&
      (obj.type === 'agent' || obj.type === 'browser') &&
      'userId' in obj &&
      typeof obj.userId === 'string' &&
      'username' in obj &&
      typeof obj.username === 'string'
    );
  }
}
