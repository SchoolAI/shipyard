/**
 * Cloudflare Worker entry point for y-webrtc signaling server
 *
 * Routes WebSocket connections to Durable Objects based on room topic.
 * Each room gets its own Durable Object instance for isolation.
 */

export { SignalingRoom } from './signaling';

export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // CORS preflight for browser connections
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Upgrade, Connection',
        },
      });
    }

    // Require WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response(
        JSON.stringify({
          status: 'y-webrtc signaling server',
          version: '1.0.0',
          protocol: 'Upgrade to WebSocket to connect',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Route to a global signaling room
    // Each connected client subscribes to topics (plan rooms) dynamically
    // We use a single DO for all connections to keep things simple
    // Alternative: create per-topic DOs (more isolation, more complexity)
    const roomId = env.SIGNALING_ROOM.idFromName('global-signaling');
    const room = env.SIGNALING_ROOM.get(roomId);

    // Forward the WebSocket upgrade request to the Durable Object
    return room.fetch(request);
  },
};
