import {
  CreateSubscriptionRequestSchema,
  getPlanMetadata,
  RegisterServerRequestSchema,
  UnregisterServerRequestSchema,
} from '@peer-plan/schema';
import express, { type Request, type Response } from 'express';
import { WebSocket } from 'ws';
import {
  handleClearPresence,
  handleCreateSession,
  handleGetReview,
  handleSetSessionToken,
  handleUpdateContent,
  handleUpdatePresence,
} from './hook-api.js';
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
 * Handle GET /registry - Return list of active servers
 */
async function handleGetRegistry(_req: Request, res: Response): Promise<void> {
  const serverList = Array.from(servers.values());
  logger.debug({ count: serverList.length }, 'Served registry');
  res.json({ servers: serverList });
}

/**
 * Handle POST /register - Register a WebSocket server
 */
async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const input = RegisterServerRequestSchema.parse(req.body);

    const entry: ServerEntry = {
      port: input.port,
      pid: input.pid,
      url: `ws://localhost:${input.port}`,
      registeredAt: Date.now(),
    };

    servers.set(input.pid, entry);
    logger.info({ port: input.port, pid: input.pid }, 'Server registered');
    res.json({ success: true, entry });
  } catch (err) {
    logger.error({ err }, 'Failed to register server');
    res.status(400).json({ error: 'Invalid request body' });
  }
}

/**
 * Handle DELETE /unregister - Unregister a WebSocket server
 */
async function handleUnregister(req: Request, res: Response): Promise<void> {
  try {
    const input = UnregisterServerRequestSchema.parse(req.body);

    const existed = servers.delete(input.pid);
    logger.info({ pid: input.pid, existed }, 'Server unregistered');
    res.json({ success: true, existed });
  } catch (err) {
    logger.error({ err }, 'Failed to unregister server');
    res.status(400).json({ error: 'Invalid request body' });
  }
}

/**
 * Handle GET /api/plan/:id/status - Return plan status for polling
 */
async function handlePlanStatus(req: Request, res: Response): Promise<void> {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).type('text/plain').send('missing_id');
    return;
  }

  try {
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata) {
      res.status(404).type('text/plain').send('not_found');
      return;
    }

    // Return plain text status for simple curl parsing
    res.type('text/plain').send(metadata.status);
  } catch (err) {
    logger.error({ err, planId }, 'Failed to get plan status');
    res.status(500).type('text/plain').send('error');
  }
}

/**
 * Handle POST /api/plan/:id/subscribe - Create a subscription
 */
async function handleSubscribe(req: Request, res: Response): Promise<void> {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).json({ error: 'Missing plan ID' });
    return;
  }

  try {
    const input = CreateSubscriptionRequestSchema.parse(req.body);

    const clientId = createSubscription({
      planId,
      subscribe: (input.subscribe || ['status']) as ChangeType[],
      windowMs: input.windowMs ?? 5000,
      maxWindowMs: input.maxWindowMs ?? 30000,
      threshold: input.threshold ?? 1,
    });

    res.json({ clientId });
  } catch (err) {
    logger.error({ err, planId }, 'Failed to create subscription');
    res.status(400).json({ error: 'Invalid request body' });
  }
}

/**
 * Handle GET /api/plan/:id/changes?clientId=X - Poll for changes
 */
async function handleGetChanges(req: Request, res: Response): Promise<void> {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).json({ error: 'Missing plan ID' });
    return;
  }

  const clientId = req.query.clientId as string | undefined;

  if (!clientId) {
    res.status(400).json({ error: 'Missing clientId' });
    return;
  }

  const result = getChanges(planId, clientId);
  if (!result) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }

  res.json(result);
}

/**
 * Handle DELETE /api/plan/:id/unsubscribe?clientId=X - Remove subscription
 */
async function handleUnsubscribe(req: Request, res: Response): Promise<void> {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).json({ error: 'Missing plan ID' });
    return;
  }

  const clientId = req.query.clientId as string | undefined;

  if (!clientId) {
    res.status(400).json({ error: 'Missing clientId' });
    return;
  }

  const deleted = deleteSubscription(planId, clientId);
  res.json({ success: deleted });
}

/**
 * Create Express app with all routes
 */
function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // Registry routes
  app.get('/registry', handleGetRegistry);
  app.post('/register', handleRegister);
  app.delete('/unregister', handleUnregister);

  // Plan status routes
  app.get('/api/plan/:id/status', handlePlanStatus);
  app.post('/api/plan/:id/subscribe', handleSubscribe);
  app.get('/api/plan/:id/changes', handleGetChanges);
  app.delete('/api/plan/:id/unsubscribe', handleUnsubscribe);

  // Hook API routes
  app.post('/api/hook/session', handleCreateSession);
  app.put('/api/hook/plan/:id/content', handleUpdateContent);
  app.get('/api/hook/plan/:id/review', handleGetReview);
  app.post('/api/hook/plan/:id/session-token', handleSetSessionToken);
  app.post('/api/hook/plan/:id/presence', handleUpdatePresence);
  app.delete('/api/hook/plan/:id/presence', handleClearPresence);

  return app;
}

/**
 * Start registry server on available port from list
 */
export async function startRegistryServer(): Promise<number | null> {
  const ports = process.env.REGISTRY_PORT
    ? [Number.parseInt(process.env.REGISTRY_PORT, 10)]
    : DEFAULT_REGISTRY_PORTS;

  const app = createApp();

  for (const port of ports) {
    try {
      await new Promise<void>((resolve, reject) => {
        // Bind to localhost only for security (prevents local network access)
        const server = app.listen(port, '127.0.0.1', () => {
          logger.info({ port }, 'Registry server started');
          setInterval(healthCheck, HEALTH_CHECK_INTERVAL);
          startCleanupInterval();
          resolve();
        });

        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(err);
          } else {
            logger.error({ err, port }, 'Registry server error');
          }
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
