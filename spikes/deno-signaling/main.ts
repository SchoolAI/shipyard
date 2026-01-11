/**
 * WebRTC Signaling Server for Deno Deploy
 *
 * Ported from Node.js (apps/signaling/src/server.js) to Deno.
 * Minimal changes from original - preserves pub/sub message protocol.
 *
 * Key differences from Node.js version:
 * - Uses Deno.serve() instead of http.createServer + ws library
 * - Uses Deno.upgradeWebSocket() for WebSocket upgrades
 * - Uses native Map instead of lib0/map (same functionality)
 * - No ping/pong interval (Deno Deploy manages connection lifecycle)
 */

const WS_READY_STATE_OPEN = 1;

/**
 * Map from topic-name to set of subscribed clients.
 */
const topics = new Map<string, Set<WebSocket>>();

/**
 * Track subscribed topics per connection for cleanup on disconnect.
 */
const connectionTopics = new WeakMap<WebSocket, Set<string>>();

/**
 * Send a message to a WebSocket connection.
 */
function send(conn: WebSocket, message: unknown): void {
  if (conn.readyState !== WS_READY_STATE_OPEN) {
    return;
  }
  try {
    conn.send(JSON.stringify(message));
  } catch (_e) {
    // Connection likely closing, ignore
  }
}

/**
 * Clean up connection subscriptions on disconnect.
 */
function cleanupConnection(conn: WebSocket): void {
  const subscribedTopics = connectionTopics.get(conn);
  if (!subscribedTopics) return;

  for (const topicName of subscribedTopics) {
    const subs = topics.get(topicName);
    if (subs) {
      subs.delete(conn);
      if (subs.size === 0) {
        topics.delete(topicName);
      }
    }
  }
  connectionTopics.delete(conn);
}

/**
 * Handle incoming WebSocket messages.
 * Protocol matches y-webrtc signaling expectations.
 */
function handleMessage(conn: WebSocket, data: string): void {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(data);
  } catch {
    return; // Invalid JSON, ignore
  }

  if (!message || typeof message.type !== 'string') {
    return;
  }

  // Ensure connection has a topic set
  if (!connectionTopics.has(conn)) {
    connectionTopics.set(conn, new Set());
  }
  const subscribedTopics = connectionTopics.get(conn)!;

  switch (message.type) {
    case 'subscribe': {
      const messageTopics = message.topics;
      if (Array.isArray(messageTopics)) {
        for (const topicName of messageTopics) {
          if (typeof topicName === 'string') {
            // Add conn to topic
            if (!topics.has(topicName)) {
              topics.set(topicName, new Set());
            }
            topics.get(topicName)!.add(conn);
            // Track topic for cleanup
            subscribedTopics.add(topicName);
          }
        }
      }
      break;
    }

    case 'unsubscribe': {
      const messageTopics = message.topics;
      if (Array.isArray(messageTopics)) {
        for (const topicName of messageTopics) {
          if (typeof topicName === 'string') {
            const subs = topics.get(topicName);
            if (subs) {
              subs.delete(conn);
              if (subs.size === 0) {
                topics.delete(topicName);
              }
            }
            subscribedTopics.delete(topicName);
          }
        }
      }
      break;
    }

    case 'publish': {
      const topic = message.topic;
      if (typeof topic === 'string') {
        const receivers = topics.get(topic);
        if (receivers) {
          // Add client count to message (y-webrtc uses this)
          const outMessage = { ...message, clients: receivers.size };
          for (const receiver of receivers) {
            send(receiver, outMessage);
          }
        }
      }
      break;
    }

    case 'ping': {
      send(conn, { type: 'pong' });
      break;
    }
  }
}

/**
 * Set up a new WebSocket connection.
 */
function setupConnection(socket: WebSocket): void {
  connectionTopics.set(socket, new Set());

  socket.addEventListener('message', (event) => {
    if (typeof event.data === 'string') {
      handleMessage(socket, event.data);
    }
  });

  socket.addEventListener('close', () => {
    cleanupConnection(socket);
  });

  socket.addEventListener('error', () => {
    cleanupConnection(socket);
  });
}

/**
 * Main HTTP server handler.
 */
Deno.serve((req: Request): Response => {
  const url = new URL(req.url);

  // Health check endpoint
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response('okay', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Stats endpoint (useful for monitoring)
  if (url.pathname === '/stats') {
    const stats = {
      topics: topics.size,
      connections: Array.from(topics.values()).reduce((sum, set) => sum + set.size, 0),
      topicList: Array.from(topics.keys()),
    };
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // WebSocket upgrade
  const upgradeHeader = req.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  setupConnection(socket);

  return response;
});
