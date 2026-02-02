/**
 * WebSocket server for daemon communication
 *
 * Listens on localhost on a configurable port (DAEMON_PORT env var).
 * Provides health check endpoint and WebSocket upgrade.
 *
 * Server is a singleton - calling startWebSocketServer() multiple times
 * returns the same port without starting additional servers.
 */

import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { listAgents } from './agent-spawner.js';
import { daemonConfig } from './config.js';
import { logger } from './logger.js';
import { handleClientMessage } from './protocol.js';

const startTime = Date.now();

/**
 * Type guard to check if an error has a specific code property.
 * Avoids unsafe type casts like `as NodeJS.ErrnoException`.
 */
function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const errorObj = Object.fromEntries(Object.entries(error));
  return errorObj.code === code;
}

/** Singleton state for the WebSocket server */
let serverPort: number | null = null;
let serverStarting: Promise<number | null> | null = null;

export async function startWebSocketServer(): Promise<number | null> {
  /** Return existing port if server already running */
  if (serverPort !== null) {
    return serverPort;
  }

  /** If server is currently starting, wait for it */
  if (serverStarting !== null) {
    return serverStarting;
  }

  /** Start the server and cache the promise to handle concurrent calls */
  serverStarting = doStartWebSocketServer();

  try {
    serverPort = await serverStarting;
    return serverPort;
  } finally {
    serverStarting = null;
  }
}

async function doStartWebSocketServer(): Promise<number | null> {
  const server = createServer((req, res) => {
    /** Health check endpoint */
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptime: Date.now() - startTime,
        })
      );
      return;
    }

    /** Debug endpoint to list active agents via HTTP (no WebSocket needed) */
    if (req.url === '/debug/agents' && req.method === 'GET') {
      const agents = listAgents();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          agents,
          count: agents.length,
          uptime: Date.now() - startTime,
        })
      );
      return;
    }

    /** All other HTTP requests are rejected */
    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ noServer: true });

  /** Handle WebSocket upgrade */
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws, request);
    });
  });

  /** Handle WebSocket connections */
  wss.on('connection', (ws: WebSocket) => {
    logger.info('WebSocket client connected');

    ws.on('message', (data: Buffer) => {
      handleClientMessage(ws, data.toString('utf-8'));
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });

    ws.on('error', (err: Error) => {
      logger.error({ err }, 'WebSocket error');
    });
  });

  const port = daemonConfig.DAEMON_PORT;

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        reject(err);
      });

      server.listen(port, 'localhost', () => {
        logger.info({ port }, 'WebSocket server listening on localhost');
        resolve();
      });
    });

    return port;
  } catch (err) {
    if (hasErrorCode(err, 'EADDRINUSE')) {
      logger.error({ port }, 'Port already in use - cannot start daemon');
    } else {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ port, err: message }, 'Failed to start WebSocket server');
    }
    return null;
  }
}
