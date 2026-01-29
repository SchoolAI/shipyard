#!/usr/bin/env node

/**
 * Local development signaling server for y-webrtc P2P connections.
 *
 * This is a thin wrapper that uses the platform-agnostic core handlers
 * with the Node.js-specific adapter. All business logic is in core/handlers/.
 *
 * Implements the y-webrtc signaling protocol:
 * - subscribe: Client subscribes to room topics (plan IDs)
 * - unsubscribe: Client leaves room topics
 * - publish: Broadcast message to all subscribers of a topic
 * - ping/pong: Keepalive
 *
 * Also implements invite token handlers:
 * - create_invite: Create time-limited invite token
 * - redeem_invite: Redeem an invite token
 * - revoke_invite: Revoke an invite token
 * - list_invites: List active invites
 *
 * Note: This is a simple pub/sub relay - no authentication or approval checking.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
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
} from '../core/handlers/index.js';
import { SignalingMessageSchema } from '../core/types.js';
import { NodePlatformAdapter } from '../node/adapter.js';
import { serverConfig } from './config/env/server.js';
import { logger } from './logger.js';

const PING_TIMEOUT_MS = 30000;
const AUTH_DEADLINE_CHECK_INTERVAL_MS = 5000;
const port = serverConfig.PORT;

const adapter = new NodePlatformAdapter();

const wss = new WebSocketServer({ noServer: true });

const server = http.createServer((_request: IncomingMessage, response: ServerResponse) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('okay');
});

/**
 * Helper function for exhaustive switch statements.
 * Ensures all cases are handled at compile time.
 *
 * @param x - The value that should never be reached
 */
function assertNever(x: never): never {
  throw new Error(`Unexpected message type: ${JSON.stringify(x)}`);
}

/**
 * Handle a new WebSocket connection.
 * Sets up message handling, ping/pong keepalive, and cleanup on close.
 *
 * @param conn - The WebSocket connection
 */
function onConnection(conn: WebSocket): void {
  logger.info('[onConnection] New connection');

  let closed = false;
  let pongReceived = true;

  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close();
      clearInterval(pingInterval);
    } else {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        conn.close();
      }
    }
  }, PING_TIMEOUT_MS);

  conn.on('pong', () => {
    pongReceived = true;
  });

  conn.on('close', () => {
    adapter.unsubscribeFromAllTopics(conn);
    closed = true;
    clearInterval(pingInterval);
  });

  conn.on('message', async (rawMessage: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const messageStr =
        rawMessage instanceof Buffer
          ? rawMessage.toString()
          : Array.isArray(rawMessage)
            ? Buffer.concat(rawMessage).toString()
            : new TextDecoder().decode(rawMessage);

      const parsed = SignalingMessageSchema.safeParse(JSON.parse(messageStr));
      if (!parsed.success || closed) return;
      const message = parsed.data;

      switch (message.type) {
        case 'subscribe':
          handleSubscribe(adapter, conn, message);
          break;

        case 'unsubscribe':
          handleUnsubscribe(adapter, conn, message);
          break;

        case 'publish':
          handlePublish(adapter, conn, message);
          break;

        case 'ping':
          adapter.sendMessage(conn, { type: 'pong' });
          break;

        case 'authenticate':
          /** Pass raw parsed data for secondary validation in handler */
          await handleAuthenticate(adapter, conn, message);
          break;

        case 'create_invite':
          await handleCreateInvite(adapter, conn, message);
          break;

        case 'redeem_invite':
          await handleRedeemInvite(adapter, conn, message);
          break;

        case 'revoke_invite':
          await handleRevokeInvite(adapter, conn, message);
          break;

        case 'list_invites':
          await handleListInvites(adapter, conn, message);
          break;

        default:
          assertNever(message);
      }
    } catch (error) {
      logger.error({ error }, 'Error handling message');
    }
  });
}

wss.on('connection', onConnection);

server.on('upgrade', (request: IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
  wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(port);

logger.info({ port }, 'Signaling server running');

/**
 * Periodic check for expired auth deadlines.
 * Connections that don't authenticate within 10 seconds are disconnected.
 */
const authDeadlineInterval = setInterval(() => {
  const disconnected = checkAuthDeadlines(adapter, (ws) => {
    if (ws instanceof WebSocket && ws.readyState === WebSocket.OPEN) {
      ws.close(1008, 'Authentication timeout');
    }
  });
  if (disconnected > 0) {
    logger.info({ count: disconnected }, 'Disconnected connections due to auth timeout');
  }
}, AUTH_DEADLINE_CHECK_INTERVAL_MS);

process.on('SIGTERM', () => {
  clearInterval(authDeadlineInterval);
  server.close();
});

process.on('SIGINT', () => {
  clearInterval(authDeadlineInterval);
  server.close();
  process.exit(0);
});
