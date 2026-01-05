import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { getPlanMetadata } from '@peer-plan/schema';
import { WebSocket } from 'ws';
import { logger } from './logger.js';
import {
  type ChangeType,
  createSubscription,
  deleteSubscription,
  getChanges,
  startCleanupInterval,
} from './subscriptions/index.js';
import { getOrCreateDoc } from './ws-server.js';

// High ephemeral range ports, unlikely to collide with other services
const DEFAULT_REGISTRY_PORTS = [32191, 32192];

const HEALTH_CHECK_INTERVAL = 10000;
const HEALTH_CHECK_TIMEOUT = 2000;

interface ServerEntry {
  port: number;
  pid: number;
  url: string;
  registeredAt: number;
}

// In-memory registry (ephemeral, no persistence)
const servers = new Map<number, ServerEntry>();

/**
 * Check if a WebSocket server is still alive by attempting to connect
 */
async function isServerAlive(entry: ServerEntry): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(entry.url);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, HEALTH_CHECK_TIMEOUT);

    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Periodic health check to remove dead servers from registry
 */
async function healthCheck(): Promise<void> {
  const entries = Array.from(servers.entries());

  for (const [pid, entry] of entries) {
    const alive = await isServerAlive(entry);
    if (!alive) {
      servers.delete(pid);
      logger.info({ pid, port: entry.port }, 'Removed dead server from registry');
    }
  }
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Handle GET /registry - Return list of active servers
 */
async function handleGetRegistry(res: ServerResponse): Promise<void> {
  const serverList = Array.from(servers.values());
  logger.debug({ count: serverList.length }, 'Served registry');
  sendJson(res, 200, { servers: serverList });
}

/**
 * Handle POST /register - Register a WebSocket server
 */
async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await parseBody(req)) as { port: number; pid: number };

    if (!body.port || !body.pid) {
      sendJson(res, 400, { error: 'Missing port or pid' });
      return;
    }

    const entry: ServerEntry = {
      port: body.port,
      pid: body.pid,
      url: `ws://localhost:${body.port}`,
      registeredAt: Date.now(),
    };

    servers.set(body.pid, entry);
    logger.info({ port: body.port, pid: body.pid }, 'Server registered');
    sendJson(res, 200, { success: true, entry });
  } catch (err) {
    logger.error({ err }, 'Failed to register server');
    sendJson(res, 400, { error: 'Invalid request body' });
  }
}

/**
 * Handle DELETE /unregister - Unregister a WebSocket server
 */
async function handleUnregister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await parseBody(req)) as { pid: number };

    if (!body.pid) {
      sendJson(res, 400, { error: 'Missing pid' });
      return;
    }

    const existed = servers.delete(body.pid);
    logger.info({ pid: body.pid, existed }, 'Server unregistered');
    sendJson(res, 200, { success: true, existed });
  } catch (err) {
    logger.error({ err }, 'Failed to unregister server');
    sendJson(res, 400, { error: 'Invalid request body' });
  }
}

/**
 * Handle GET /api/plan/:id/status - Return plan status for polling
 */
async function handlePlanStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const match = req.url?.match(/^\/api\/plan\/([^/]+)\/status$/);
  if (!match?.[1]) {
    sendJson(res, 400, { error: 'Invalid plan ID' });
    return;
  }

  const planId = decodeURIComponent(match[1]);

  try {
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata) {
      res.writeHead(404, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      });
      res.end('not_found');
      return;
    }

    // Return plain text status for simple curl parsing
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(metadata.status);
  } catch (err) {
    logger.error({ err, planId }, 'Failed to get plan status');
    res.writeHead(500, {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    });
    res.end('error');
  }
}

/**
 * Handle POST /api/plan/:id/subscribe - Create a subscription
 */
async function handleSubscribe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const match = req.url?.match(/^\/api\/plan\/([^/]+)\/subscribe$/);
  if (!match?.[1]) {
    sendJson(res, 400, { error: 'Invalid plan ID' });
    return;
  }

  const planId = decodeURIComponent(match[1]);

  try {
    const body = (await parseBody(req)) as {
      subscribe?: string[];
      windowMs?: number;
      maxWindowMs?: number;
      threshold?: number;
    };

    const clientId = createSubscription({
      planId,
      subscribe: (body.subscribe || ['status']) as ChangeType[],
      windowMs: body.windowMs ?? 5000,
      maxWindowMs: body.maxWindowMs ?? 30000,
      threshold: body.threshold ?? 1,
    });

    sendJson(res, 200, { clientId });
  } catch (err) {
    logger.error({ err, planId }, 'Failed to create subscription');
    sendJson(res, 400, { error: 'Invalid request body' });
  }
}

/**
 * Handle GET /api/plan/:id/changes?clientId=X - Poll for changes
 */
async function handleGetChanges(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const match = req.url?.match(/^\/api\/plan\/([^/]+)\/changes\?clientId=([^&]+)/);
  if (!match?.[1] || !match?.[2]) {
    sendJson(res, 400, { error: 'Invalid plan ID or clientId' });
    return;
  }

  const planId = decodeURIComponent(match[1]);
  const clientId = decodeURIComponent(match[2]);

  const result = getChanges(planId, clientId);
  if (!result) {
    sendJson(res, 404, { error: 'Subscription not found' });
    return;
  }

  sendJson(res, 200, result);
}

/**
 * Handle DELETE /api/plan/:id/unsubscribe?clientId=X - Remove subscription
 */
async function handleUnsubscribe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const match = req.url?.match(/^\/api\/plan\/([^/]+)\/unsubscribe\?clientId=([^&]+)/);
  if (!match?.[1] || !match?.[2]) {
    sendJson(res, 400, { error: 'Invalid plan ID or clientId' });
    return;
  }

  const planId = decodeURIComponent(match[1]);
  const clientId = decodeURIComponent(match[2]);

  const deleted = deleteSubscription(planId, clientId);
  sendJson(res, 200, { success: deleted });
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/registry') {
    await handleGetRegistry(res);
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/plan/') && req.url?.endsWith('/status')) {
    await handlePlanStatus(req, res);
    return;
  }

  if (req.method === 'POST' && req.url?.match(/^\/api\/plan\/[^/]+\/subscribe$/)) {
    await handleSubscribe(req, res);
    return;
  }

  if (req.method === 'GET' && req.url?.match(/^\/api\/plan\/[^/]+\/changes/)) {
    await handleGetChanges(req, res);
    return;
  }

  if (req.method === 'DELETE' && req.url?.match(/^\/api\/plan\/[^/]+\/unsubscribe/)) {
    await handleUnsubscribe(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/register') {
    await handleRegister(req, res);
    return;
  }

  if (req.method === 'DELETE' && req.url === '/unregister') {
    await handleUnregister(req, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

/**
 * Start registry server on available port from list
 */
export async function startRegistryServer(): Promise<number | null> {
  const ports = process.env.REGISTRY_PORT
    ? [Number.parseInt(process.env.REGISTRY_PORT, 10)]
    : DEFAULT_REGISTRY_PORTS;

  for (const port of ports) {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = createServer(handleRequest);

        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(err);
          } else {
            logger.error({ err, port }, 'Registry server error');
          }
        });

        server.listen(port, () => {
          logger.info({ port }, 'Registry server started');
          setInterval(healthCheck, HEALTH_CHECK_INTERVAL);
          startCleanupInterval();
          resolve();
        });
      });

      return port;
    } catch {
      // continue to next port
    }
  }

  logger.warn({ ports }, 'All registry ports in use');
  return null;
}

/**
 * Check if registry server is already running
 */
export async function isRegistryRunning(): Promise<number | null> {
  const ports = process.env.REGISTRY_PORT
    ? [Number.parseInt(process.env.REGISTRY_PORT, 10)]
    : DEFAULT_REGISTRY_PORTS;

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        return port;
      }
    } catch {
      // continue to next port
    }
  }

  return null;
}
