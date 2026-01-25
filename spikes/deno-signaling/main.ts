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
 * Parse a signaling message from raw JSON string.
 * Returns null if the message is invalid.
 */
function parseMessage(data: string): Record<string, unknown> | null {
  try {
    const message = JSON.parse(data);
    if (!message || typeof message.type !== 'string') {
      return null;
    }
    return message;
  } catch {
    return null;
  }
}

/**
 * Extract string topic names from a message's topics array.
 */
function extractTopicNames(message: Record<string, unknown>): string[] {
  const messageTopics = message.topics;
  if (!Array.isArray(messageTopics)) {
    return [];
  }
  return messageTopics.filter((t): t is string => typeof t === 'string');
}

/**
 * Handle subscribe message - add connection to requested topics.
 */
function handleSubscribe(
  conn: WebSocket,
  message: Record<string, unknown>,
  subscribedTopics: Set<string>
): void {
  for (const topicName of extractTopicNames(message)) {
    if (!topics.has(topicName)) {
      topics.set(topicName, new Set());
    }
    topics.get(topicName)?.add(conn);
    subscribedTopics.add(topicName);
  }
}

/**
 * Handle unsubscribe message - remove connection from topics.
 */
function handleUnsubscribe(
  conn: WebSocket,
  message: Record<string, unknown>,
  subscribedTopics: Set<string>
): void {
  for (const topicName of extractTopicNames(message)) {
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

/**
 * Handle publish message - broadcast to all topic subscribers.
 */
function handlePublish(message: Record<string, unknown>): void {
  const topic = message.topic;
  if (typeof topic !== 'string') {
    return;
  }
  const receivers = topics.get(topic);
  if (!receivers) {
    return;
  }
  const outMessage = { ...message, clients: receivers.size };
  for (const receiver of receivers) {
    send(receiver, outMessage);
  }
}

/**
 * Handle incoming WebSocket messages.
 * Protocol matches y-webrtc signaling expectations.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Spike code, complexity is acceptable for POC
function handleMessage(conn: WebSocket, data: string): void {
  const message = parseMessage(data);
  if (!message) {
    return;
  }

  // Ensure connection has a topic set and get it
  let subscribedTopics = connectionTopics.get(conn);
  if (!subscribedTopics) {
    subscribedTopics = new Set();
    connectionTopics.set(conn, subscribedTopics);
  }

  switch (message.type) {
    case 'subscribe':
      handleSubscribe(conn, message, subscribedTopics);
      break;
    case 'unsubscribe':
      handleUnsubscribe(conn, message, subscribedTopics);
      break;
    case 'publish':
      handlePublish(message);
      break;
    case 'ping':
      send(conn, { type: 'pong' });
      break;
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
