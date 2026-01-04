import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocket } from 'ws';
import { logger } from './logger.js';

// Default registry ports (high ephemeral range, unlikely to collide)
const DEFAULT_REGISTRY_PORTS = [32191, 32192];

// How often to check if registered servers are still alive (ms)
const HEALTH_CHECK_INTERVAL = 10000;

// Timeout for health check connection attempts (ms)
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
 * Handle incoming HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Route to specific handlers
  if (req.method === 'GET' && req.url === '/registry') {
    await handleGetRegistry(res);
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

  // 404 for everything else
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

          // Start periodic health checks to remove dead servers
          setInterval(healthCheck, HEALTH_CHECK_INTERVAL);

          resolve();
        });
      });

      return port;
    } catch {
      // Port in use, try next
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
      // Not running on this port
    }
  }

  return null;
}
