import { beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startWebSocketServer } from './websocket-server.js';

/**
 * Integration tests for WebSocket server.
 *
 * Why these tests exist (3+ rule):
 * - WebSocket server is the public interface for browser communication
 * - Entry point for all daemon operations
 * - Critical for agent spawning workflow
 *
 * Note: Server is singleton - once started, remains running.
 * All tests share the same server instance.
 */
describe('WebSocket Server', () => {
  let serverPort: number | null;

  beforeAll(async () => {
    serverPort = await startWebSocketServer();
  });

  describe('Server Startup', () => {
    it('starts and returns a valid port', () => {
      expect(serverPort).toBeGreaterThan(0);
      expect([56609, 49548]).toContain(serverPort);
    });
  });

  describe('HTTP Endpoints', () => {
    it('health check returns 200 with uptime', async () => {
      if (!serverPort) {
        throw new Error('Server not running');
      }

      const response = await fetch(`http://localhost:${serverPort}/health`);

      expect(response.status).toBe(200);

      const data = (await response.json()) as { status: string; uptime: number };
      expect(data.status).toBe('ok');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('invalid endpoints return 404', async () => {
      if (!serverPort) {
        throw new Error('Server not running');
      }

      const response = await fetch(`http://localhost:${serverPort}/invalid`);

      expect(response.status).toBe(404);
    });
  });

  describe('WebSocket Connections', () => {
    it('accepts WebSocket upgrade', async () => {
      if (!serverPort) {
        throw new Error('Server not running');
      }

      const ws = new WebSocket(`ws://localhost:${serverPort}`);

      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });

    it('handles concurrent connections', async () => {
      if (!serverPort) {
        throw new Error('Server not running');
      }

      const ws1 = new WebSocket(`ws://localhost:${serverPort}`);
      const ws2 = new WebSocket(`ws://localhost:${serverPort}`);

      await Promise.all([
        new Promise<void>((resolve) => ws1.once('open', resolve)),
        new Promise<void>((resolve) => ws2.once('open', resolve)),
      ]);

      expect(ws1.readyState).toBe(WebSocket.OPEN);
      expect(ws2.readyState).toBe(WebSocket.OPEN);

      ws1.close();
      ws2.close();
    });
  });
});
