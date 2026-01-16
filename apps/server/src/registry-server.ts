import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  type A2AMessage,
  a2aToClaudeCode,
  type ConversationExportMeta,
  CreateSubscriptionRequestSchema,
  formatAsClaudeCodeJSONL,
  getPlanMetadata,
} from '@peer-plan/schema';
import express, { type Request, type Response } from 'express';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { nanoid } from 'nanoid';
import { type WebSocket, WebSocketServer } from 'ws';
import { LeveldbPersistence } from 'y-leveldb';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { registryConfig } from './config/env/registry.js';
import { getOctokit, parseRepoString } from './github-artifacts.js';
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
  attachObservers,
  type ChangeType,
  createSubscription,
  deleteSubscription,
  getChanges,
  startCleanupInterval,
} from './subscriptions/index.js';

// Shared LevelDB for all plans (no session-pid isolation)
const PERSISTENCE_DIR = join(homedir(), '.peer-plan', 'plans');

// Lock file to prevent multiple processes from starting the hub simultaneously
const HUB_LOCK_FILE = join(homedir(), '.peer-plan', 'hub.lock');

// Message types matching y-websocket protocol
const messageSync = 0;
const messageAwareness = 1;

// Y.Doc management
const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const conns = new Map<string, Set<WebSocket>>();

let ldb: LeveldbPersistence | null = null;

/**
 * Attempts to acquire exclusive lock for hub startup.
 * Uses atomic file creation (wx flag) to prevent race conditions.
 * Returns true if lock acquired, false if another process holds the lock.
 */
export async function tryAcquireHubLock(): Promise<boolean> {
  try {
    // Ensure directory exists
    mkdirSync(join(homedir(), '.peer-plan'), { recursive: true });

    // Atomic create-only write (fails if exists)
    await writeFile(HUB_LOCK_FILE, `${process.pid}\n${Date.now()}`, { flag: 'wx' });

    // Clean up lock on process exit
    process.once('exit', () => {
      try {
        unlinkSync(HUB_LOCK_FILE);
      } catch {
        // Lock may already be cleaned up
      }
    });

    logger.info({ pid: process.pid }, 'Acquired hub lock');
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      // Lock exists - check if holder is still alive
      try {
        const content = await readFile(HUB_LOCK_FILE, 'utf-8');
        const pidStr = content.split('\n')[0] ?? '';
        const pid = Number.parseInt(pidStr, 10);

        // Check if process is alive (signal 0 doesn't kill, just checks)
        try {
          process.kill(pid, 0);
          logger.debug({ holderPid: pid }, 'Hub lock held by active process');
          return false; // Process alive, lock valid
        } catch {
          // Process dead, remove stale lock and retry
          logger.warn({ stalePid: pid }, 'Removing stale hub lock');
          await unlink(HUB_LOCK_FILE);
          return tryAcquireHubLock(); // Recursive retry
        }
      } catch (readErr) {
        logger.error({ err: readErr }, 'Failed to read hub lock file');
        return false;
      }
    }
    logger.error({ err }, 'Failed to acquire hub lock');
    return false;
  }
}

/**
 * Releases the hub lock file.
 * Called on graceful shutdown.
 */
export async function releaseHubLock(): Promise<void> {
  try {
    await unlink(HUB_LOCK_FILE);
    logger.info('Released hub lock');
  } catch (err) {
    // Lock file may already be cleaned up by exit handler
    logger.debug({ err }, 'Hub lock already released');
  }
}

/**
 * Checks if an error is a LevelDB lock error.
 */
function isLevelDbLockError(error: Error): boolean {
  return error.message?.includes('LOCK') || error.message?.includes('lock');
}

/**
 * Checks if a process with given PID is alive.
 * Returns true if process is alive, false if dead.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 doesn't kill, just checks
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to recover from a stale LevelDB lock by removing the lock file.
 * Returns true if recovery was successful, false if lock is held by active process.
 * Throws if recovery fails for other reasons.
 */
function tryRecoverStaleLock(originalError: Error): boolean {
  const lockFile = join(PERSISTENCE_DIR, 'LOCK');

  // Try to read hub.lock to check if holder is alive
  // LevelDB doesn't store PID, so we use our hub.lock
  try {
    const hubLockContent = readFileSync(HUB_LOCK_FILE, 'utf-8');
    const pidStr = hubLockContent.split('\n')[0] ?? '';
    const pid = Number.parseInt(pidStr, 10);

    if (isProcessAlive(pid)) {
      logger.error({ holderPid: pid }, 'LevelDB locked by active process, cannot recover');
      throw originalError;
    }

    // Process dead, safe to remove lock
    logger.warn('Hub process dead, removing stale LevelDB lock');
    unlinkSync(lockFile);
    return true;
  } catch (hubLockErr) {
    // Re-throw if it's the original error (lock is valid)
    if (hubLockErr === originalError) {
      throw hubLockErr;
    }
    // No hub.lock file - assume lock is stale (no process running)
    logger.warn('No hub.lock found, assuming LevelDB lock is stale');
    unlinkSync(lockFile);
    return true;
  }
}

/**
 * Ensures LevelDB persistence is initialized.
 * Handles lock errors by checking if the lock holder process is still alive.
 * If the lock is stale (process dead), removes it and retries initialization.
 */
function initPersistence(): void {
  if (ldb) return;

  mkdirSync(PERSISTENCE_DIR, { recursive: true });

  try {
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);
    logger.info({ dir: PERSISTENCE_DIR }, 'LevelDB persistence initialized');
    return;
  } catch (err) {
    const error = err as Error;

    if (!isLevelDbLockError(error)) {
      logger.error({ err: error }, 'Failed to initialize LevelDB persistence');
      throw error;
    }

    logger.warn({ err: error }, 'LevelDB locked, checking for stale lock');
    tryRecoverStaleLock(error);

    // Lock removed, retry initialization
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);
    logger.info('Recovered from stale LevelDB lock');
  }
}

async function getDoc(docName: string): Promise<Y.Doc> {
  initPersistence();
  const persistence = ldb;
  if (!persistence) {
    throw new Error('LevelDB persistence failed to initialize');
  }

  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();

    const persistedDoc = await persistence.getYDoc(docName);
    const state = Y.encodeStateAsUpdate(persistedDoc);
    Y.applyUpdate(doc, state);

    doc.on('update', (update: Uint8Array) => {
      persistence.storeUpdate(docName, update);
    });

    docs.set(docName, doc);

    const awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(docName, awareness);

    // Attach observers for subscription notifications
    attachObservers(docName, doc);
  }
  return doc;
}

/**
 * Gets or creates a Y.Doc by name. Exported for use by MCP tools.
 * This function ensures persistence is initialized before accessing docs.
 */
export async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  return getDoc(docName);
}

/**
 * Checks if there are any active WebSocket connections for a given plan.
 * Used to avoid opening duplicate browser tabs.
 */
export function hasActiveConnections(planId: string): boolean {
  const connections = conns.get(planId);
  return connections !== undefined && connections.size > 0;
}

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState === ws.OPEN) {
    ws.send(message);
  }
}

function broadcastUpdate(docName: string, update: Uint8Array, origin: unknown) {
  const docConns = conns.get(docName);
  if (!docConns) return;

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);

  for (const conn of docConns) {
    if (conn !== origin) {
      send(conn, message);
    }
  }
}

function handleWebSocketConnection(ws: WebSocket, req: http.IncomingMessage): void {
  const planId = req.url?.slice(1) || 'default';
  logger.info({ planId }, 'WebSocket client connected to registry');

  // Use an async IIFE to handle the async operations
  (async () => {
    try {
      const doc = await getDoc(planId);
      const awareness = awarenessMap.get(planId);
      if (!awareness) {
        throw new Error(`Awareness not found for planId: ${planId}`);
      }
      logger.debug({ planId }, 'Got doc and awareness');

      if (!conns.has(planId)) {
        conns.set(planId, new Set());
      }
      const planConns = conns.get(planId);
      planConns?.add(ws);

      const updateHandler = (update: Uint8Array, origin: unknown) => {
        broadcastUpdate(planId, update, origin);
      };
      doc.on('update', updateHandler);

      const awarenessHandler = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        _origin: unknown
      ) => {
        const changedClients = added.concat(updated, removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(encoder);
        for (const conn of conns.get(planId) || []) {
          send(conn, message);
        }
      };
      awareness.on('update', awarenessHandler);

      // Send initial sync state
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      send(ws, encoding.toUint8Array(encoder));

      // Send current awareness states
      const awarenessStates = awareness.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
        );
        send(ws, encoding.toUint8Array(awarenessEncoder));
      }

      ws.on('message', (message: Buffer) => {
        try {
          const decoder = decoding.createDecoder(new Uint8Array(message));
          const messageType = decoding.readVarUint(decoder);

          switch (messageType) {
            case messageSync: {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, messageSync);
              syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
              if (encoding.length(encoder) > 1) {
                send(ws, encoding.toUint8Array(encoder));
              }
              break;
            }
            case messageAwareness: {
              awarenessProtocol.applyAwarenessUpdate(
                awareness,
                decoding.readVarUint8Array(decoder),
                ws
              );
              break;
            }
          }
        } catch (err) {
          logger.error({ err, planId }, 'Failed to process message');
        }
      });

      ws.on('close', () => {
        logger.info({ planId }, 'WebSocket client disconnected from registry');
        doc.off('update', updateHandler);
        awareness.off('update', awarenessHandler);
        conns.get(planId)?.delete(ws);
        awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
      });

      ws.on('error', (err: Error) => {
        logger.error({ err, planId }, 'WebSocket error');
      });
    } catch (err) {
      logger.error({ err, planId }, 'Error handling WebSocket connection');
      ws.close();
    }
  })();
}

/**
 * Health check endpoint - used by browser and hook to discover if server is running.
 * No longer tracks registered servers - just returns OK status.
 */
async function handleHealthCheck(_req: Request, res: Response): Promise<void> {
  res.json({ status: 'ok' });
}

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

    res.type('text/plain').send(metadata.status);
  } catch (err) {
    logger.error({ err, planId }, 'Failed to get plan status');
    res.status(500).type('text/plain').send('error');
  }
}

async function handleHasConnections(req: Request, res: Response): Promise<void> {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).json({ error: 'Missing plan ID' });
    return;
  }

  const has = hasActiveConnections(planId);
  res.json({ hasConnections: has });
}

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

async function handleGetPRDiff(req: Request, res: Response): Promise<void> {
  const { id: planId, prNumber } = req.params;

  if (!planId || !prNumber) {
    res.status(400).json({ error: 'Missing plan ID or PR number' });
    return;
  }

  try {
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata || !metadata.repo) {
      res.status(404).json({ error: 'Plan not found or repo not set' });
      return;
    }

    const octokit = getOctokit();
    if (!octokit) {
      res.status(500).json({ error: 'GitHub authentication not configured' });
      return;
    }

    const { owner, repoName } = parseRepoString(metadata.repo);
    const prNum = Number.parseInt(prNumber, 10);

    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo: repoName,
      pull_number: prNum,
      headers: {
        accept: 'application/vnd.github.diff',
      },
    });

    res.type('text/plain').send(response.data);
    logger.debug({ planId, prNumber: prNum, repo: metadata.repo }, 'Served PR diff');
  } catch (error) {
    logger.error({ error, planId, prNumber }, 'Failed to fetch PR diff');
    const status = (error as { status?: number }).status || 500;
    res.status(status).json({ error: 'Failed to fetch PR diff' });
  }
}

async function handleGetPRFiles(req: Request, res: Response): Promise<void> {
  const { id: planId, prNumber } = req.params;

  if (!planId || !prNumber) {
    res.status(400).json({ error: 'Missing plan ID or PR number' });
    return;
  }

  try {
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata || !metadata.repo) {
      res.status(404).json({ error: 'Plan not found or repo not set' });
      return;
    }

    const octokit = getOctokit();
    if (!octokit) {
      res.status(500).json({ error: 'GitHub authentication not configured' });
      return;
    }

    const { owner, repoName } = parseRepoString(metadata.repo);
    const prNum = Number.parseInt(prNumber, 10);

    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: prNum,
    });

    const fileList = files.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    }));

    res.json({ files: fileList });
    logger.debug({ planId, prNumber: prNum, fileCount: fileList.length }, 'Served PR files');
  } catch (error) {
    logger.error({ error, planId, prNumber }, 'Failed to fetch PR files');
    const status = (error as { status?: number }).status || 500;
    res.status(status).json({ error: 'Failed to fetch PR files' });
  }
}

async function handleImportConversation(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      a2aMessages?: A2AMessage[];
      meta?: ConversationExportMeta;
    };

    const { a2aMessages, meta } = body;

    if (!a2aMessages || !Array.isArray(a2aMessages)) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid a2aMessages',
      });
      return;
    }

    if (a2aMessages.length === 0) {
      res.status(400).json({
        success: false,
        error: 'a2aMessages array is empty',
      });
      return;
    }

    const sessionId = nanoid();
    const claudeMessages = a2aToClaudeCode(a2aMessages, sessionId);
    const jsonl = formatAsClaudeCodeJSONL(claudeMessages);

    const projectName = meta?.planId
      ? `peer-plan-${meta.planId.slice(0, 8)}`
      : process.cwd().split('/').pop() || 'peer-plan';

    const projectPath = join(homedir(), '.claude', 'projects', projectName);
    await mkdir(projectPath, { recursive: true });
    const transcriptPath = join(projectPath, `${sessionId}.jsonl`);

    await writeFile(transcriptPath, jsonl, 'utf-8');

    logger.info(
      {
        sessionId,
        transcriptPath,
        messageCount: claudeMessages.length,
        sourcePlatform: meta?.sourcePlatform,
      },
      'Created Claude Code session from imported conversation'
    );

    res.json({
      success: true,
      sessionId,
      transcriptPath,
      messageCount: claudeMessages.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to import conversation');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleGetTranscript(req: Request, res: Response): Promise<void> {
  const planId = req.params.id;
  if (!planId) {
    res.status(400).json({ error: 'Missing plan ID' });
    return;
  }

  try {
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

    if (!metadata?.origin) {
      res.status(404).json({ error: 'Plan has no origin metadata' });
      return;
    }

    if (metadata.origin.platform !== 'claude-code') {
      res.status(400).json({ error: 'Transcript only available for Claude Code plans' });
      return;
    }

    const transcriptPath = (metadata.origin as { transcriptPath?: string }).transcriptPath;
    if (!transcriptPath) {
      res.status(404).json({ error: 'No transcript path in origin metadata' });
      return;
    }

    const content = await readFile(transcriptPath, 'utf-8');
    res.type('text/plain').send(content);
    logger.debug({ planId, transcriptPath, size: content.length }, 'Served transcript for handoff');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'Transcript file not found' });
    } else {
      logger.error({ error, planId }, 'Failed to read transcript');
      res.status(500).json({ error: 'Failed to read transcript' });
    }
  }
}

/**
 * Creates the Express app with all HTTP routes.
 *
 * Architecture note: Routes are intentionally grouped by domain (plan, hook, conversation).
 * Hook handlers are already factored out to hook-api.ts. Further splitting would scatter
 * related routes across files without meaningful benefit. The current structure:
 * - Plan API: status, connections, subscriptions, PR diff/files
 * - Hook API: session, content, review, presence (handlers in hook-api.ts)
 * - Conversation API: import
 *
 * Express Router could organize routes, but wouldn't reduce actual complexity.
 * If this file grows significantly, consider extracting plan-api.ts handlers.
 */
function createApp(): { app: express.Express; httpServer: http.Server } {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(express.json());
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // Health check endpoint - used by browser and hook to discover if server is running
  app.get('/registry', handleHealthCheck);

  app.get('/api/plan/:id/status', handlePlanStatus);
  app.get('/api/plan/:id/has-connections', handleHasConnections);
  app.get('/api/plan/:id/transcript', handleGetTranscript);
  app.post('/api/plan/:id/subscribe', handleSubscribe);
  app.get('/api/plan/:id/changes', handleGetChanges);
  app.delete('/api/plan/:id/unsubscribe', handleUnsubscribe);

  app.get('/api/plans/:id/pr-diff/:prNumber', handleGetPRDiff);
  app.get('/api/plans/:id/pr-files/:prNumber', handleGetPRFiles);

  app.post('/api/hook/session', handleCreateSession);
  app.put('/api/hook/plan/:id/content', handleUpdateContent);
  app.get('/api/hook/plan/:id/review', handleGetReview);
  app.post('/api/hook/plan/:id/session-token', handleSetSessionToken);
  app.post('/api/hook/plan/:id/presence', handleUpdatePresence);
  app.delete('/api/hook/plan/:id/presence', handleClearPresence);

  app.post('/api/conversation/import', handleImportConversation);

  return { app, httpServer };
}

export async function startRegistryServer(): Promise<number | null> {
  const ports = registryConfig.REGISTRY_PORT;

  const { httpServer } = createApp();

  // Create WebSocket server with noServer mode for upgrade handling
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests for WebSocket connections
  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // Handle WebSocket connections
  wss.on('connection', handleWebSocketConnection);

  // Register signal handlers for graceful shutdown with lock cleanup
  process.once('SIGINT', async () => {
    await releaseHubLock();
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    await releaseHubLock();
    process.exit(0);
  });

  for (const port of ports) {
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.listen(port, '127.0.0.1', () => {
          logger.info(
            { port, persistence: PERSISTENCE_DIR },
            'Registry server started with WebSocket support'
          );
          startCleanupInterval();
          resolve();
        });

        httpServer.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(err);
          } else {
            logger.error({ err, port }, 'Registry server error');
          }
        });
      });

      return port;
    } catch {}
  }

  logger.warn({ ports }, 'All registry ports in use');
  return null;
}

export async function isRegistryRunning(): Promise<number | null> {
  const ports = registryConfig.REGISTRY_PORT;

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        return port;
      }
    } catch {}
  }

  return null;
}
