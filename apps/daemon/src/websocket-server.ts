/**
 * WebSocket server for daemon communication
 *
 * Listens on localhost ports [56609, 49548] with fallback.
 * Provides health check endpoint and WebSocket upgrade.
 */

import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { handleClientMessage } from './protocol.js';

const PORTS = [56609, 49548];
const startTime = Date.now();

export async function startWebSocketServer(): Promise<number | null> {
  const server = createServer((req, res) => {
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

    res.writeHead(404);
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      wss.emit('connection', ws, request);
    });
  });

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
      const isErrnoException = (e: unknown): e is NodeJS.ErrnoException =>
        e instanceof Error && 'code' in e;
      if (isErrnoException(err) && err.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying next port`);
        continue;
      }
      throw err;
    }
  }

  console.error('All ports in use');
  return null;
}
