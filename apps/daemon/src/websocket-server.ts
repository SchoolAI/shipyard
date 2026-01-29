/**
 * WebSocket server for daemon communication
 *
 * Listens on localhost ports [56609, 49548] with fallback.
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
import { handleClientMessage } from './protocol.js';

const PORTS = [56609, 49548];
const startTime = Date.now();

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
    console.log('WebSocket client connected');

    ws.on('message', (data: Buffer) => {
      handleClientMessage(ws, data.toString('utf-8'));
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (err: Error) => {
      console.error('WebSocket error:', err);
    });
  });

  /** Try each port with fallback */
  for (const port of PORTS) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(err);
          } else {
            reject(err);
          }
        });

        server.listen(port, 'localhost', () => {
          console.log(`WebSocket server listening on localhost:${port}`);
          resolve();
        });
      });

      return port;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying next port`);
        continue;
      }
      throw err;
    }
  }

  console.error('All ports in use');
  return null;
}
