import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join, resolve, sep } from 'node:path';

import {
  appRouter,
  type Context,
  DEFAULT_EPOCH,
  EPOCH_CLOSE_CODES,
  EPOCH_CLOSE_REASONS,
  getEpochFromMetadata,
  getPlanIndexMetadata,
  getPlanMetadata,
  hasErrorCode,
  initPlanIndexMetadata,
  isEpochValid,
  type PlanStore,
} from '@shipyard/schema';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Request, type Response } from 'express';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { type WebSocket, WebSocketServer } from 'ws';
import { LeveldbPersistence } from 'y-leveldb';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { registryConfig } from './config/env/registry.js';
import { createConversationHandlers } from './conversation-handlers.js';
import { attachCRDTValidation } from './crdt-validation.js';
import { getFileContent, getLocalChanges } from './git-local-changes.js';
import { getOctokit, parseRepoString } from './github-artifacts.js';
import { createHookHandlers } from './hook-handlers.js';
import { logger } from './logger.js';
import { getGitHubUsername, getMachineId, getMachineName } from './server-identity.js';
import {
  attachObservers,
  type ChangeType,
  createSubscription,
  deleteSubscription,
  getChanges,
  startCleanupInterval,
} from './subscriptions/index.js';

/**
 * Extract a single string value from Express route params.
 * Handles Express 5.x type change where params can be string | string[].
 */
function getParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Extract HTTP status code from an error object if available.
 */
function getErrorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 500;
  const record = Object.fromEntries(Object.entries(error));
  const status = record.status;
  return typeof status === 'number' ? status : 500;
}

/** Shared LevelDB for all plans (no session-pid isolation) */
const PERSISTENCE_DIR = join(registryConfig.SHIPYARD_STATE_DIR, 'plans');

/** Lock file to prevent multiple processes from starting the hub simultaneously */
const HUB_LOCK_FILE = join(registryConfig.SHIPYARD_STATE_DIR, 'hub.lock');
const SHIPYARD_DIR = registryConfig.SHIPYARD_STATE_DIR;
const MAX_LOCK_RETRIES = 3;

/** Message types matching y-websocket protocol */
const messageSync = 0;
const messageAwareness = 1;

/** Y.Doc management */
const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const conns = new Map<string, Set<WebSocket>>();

let ldb: LeveldbPersistence | null = null;

/**
 * Reads the lock file and returns the PID of the lock holder, or null if unreadable.
 */
async function readLockHolderPid(): Promise<number | null> {
  try {
    const content = await readFile(HUB_LOCK_FILE, 'utf-8');
    const pidStr = content.split('\n')[0] ?? '';
    return Number.parseInt(pidStr, 10);
  } catch (readErr) {
    logger.error({ err: readErr }, 'Failed to read hub lock file');
    return null;
  }
}

/**
 * Checks if the lock holder process is alive.
 * Returns true if process is alive, false if dead or unknown.
 */
function isLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to remove a stale lock file.
 * Returns true if removal succeeded or was unnecessary.
 */
async function tryRemoveStaleLock(stalePid: number, retryCount: number): Promise<boolean> {
  logger.warn({ stalePid, retryCount }, 'Removing stale hub lock');
  try {
    await unlink(HUB_LOCK_FILE);
    return true;
  } catch (unlinkErr) {
    logger.error({ err: unlinkErr, stalePid, retryCount }, 'Failed to remove stale hub lock');
    return false;
  }
}

/**
 * Registers cleanup handler to remove lock file on process exit.
 */
function registerLockCleanupHandler(): void {
  process.once('exit', () => {
    try {
      unlinkSync(HUB_LOCK_FILE);
    } catch {
      /** Lock may already be cleaned up */
    }
  });
}

/**
 * Handles the case when lock file already exists.
 * Checks if holder is alive, and if not, removes stale lock and retries.
 * Returns true if lock was acquired on retry, false otherwise.
 */
async function handleExistingLock(retryCount: number): Promise<boolean> {
  const pid = await readLockHolderPid();
  if (pid === null) return false;

  if (isLockHolderAlive(pid)) {
    logger.debug({ holderPid: pid }, 'Hub lock held by active process');
    return false;
  }

  /** Process dead - check retry limit before attempting removal */
  if (retryCount >= MAX_LOCK_RETRIES) {
    logger.error(
      { stalePid: pid, retryCount },
      'Max retries exceeded while removing stale hub lock'
    );
    return false;
  }

  /** Attempt to remove stale lock and retry */
  await tryRemoveStaleLock(pid, retryCount);
  return tryAcquireHubLock(retryCount + 1);
}

/**
 * Attempts to acquire exclusive lock for hub startup.
 * Uses atomic file creation (wx flag) to prevent race conditions.
 * Returns true if lock acquired, false if another process holds the lock.
 * Max retries: 3 attempts to remove stale locks before giving up.
 */
export async function tryAcquireHubLock(retryCount = 0): Promise<boolean> {
  try {
    mkdirSync(SHIPYARD_DIR, { recursive: true });
    await writeFile(HUB_LOCK_FILE, `${process.pid}\n${Date.now()}`, { flag: 'wx' });
    registerLockCleanupHandler();
    logger.info({ pid: process.pid }, 'Acquired hub lock');
    return true;
  } catch (err) {
    if (hasErrorCode(err, 'EEXIST')) {
      return handleExistingLock(retryCount);
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
    /** Lock file may already be cleaned up by exit handler */
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
    process.kill(pid, 0);
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

  /*
   * Try to read hub.lock to check if holder is alive
   * LevelDB doesn't store PID, so we use our hub.lock
   */
  try {
    const hubLockContent = readFileSync(HUB_LOCK_FILE, 'utf-8');
    const pidStr = hubLockContent.split('\n')[0] ?? '';
    const pid = Number.parseInt(pidStr, 10);

    if (isProcessAlive(pid)) {
      logger.error({ holderPid: pid }, 'LevelDB locked by active process, cannot recover');
      throw originalError;
    }

    /** Process dead, safe to remove lock */
    logger.warn('Hub process dead, removing stale LevelDB lock');
    unlinkSync(lockFile);
    return true;
  } catch (hubLockErr) {
    /** Re-throw if it's the original error (lock is valid) */
    if (hubLockErr === originalError) {
      throw hubLockErr;
    }
    /** No hub.lock file - assume lock is stale (no process running) */
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
    if (!(err instanceof Error)) {
      logger.error({ err }, 'Failed to initialize LevelDB persistence with unknown error');
      throw new Error(String(err));
    }

    if (!isLevelDbLockError(err)) {
      logger.error({ err }, 'Failed to initialize LevelDB persistence');
      throw err;
    }

    logger.warn({ err }, 'LevelDB locked, checking for stale lock');
    tryRecoverStaleLock(err);

    /** Lock removed, retry initialization */
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);
    logger.info('Recovered from stale LevelDB lock');
  }
}

function shouldRejectForEpoch(doc: Y.Doc, planId: string): boolean {
  const minimumEpoch = registryConfig.MINIMUM_EPOCH;

  if (planId === 'plan-index') {
    const metadata = getPlanIndexMetadata(doc);
    if (!metadata) {
      logger.warn({ planId }, 'Plan-index metadata missing - rejecting for security');
      return true;
    }

    const planEpoch = getEpochFromMetadata(metadata);
    if (!isEpochValid(planEpoch, minimumEpoch)) {
      logger.warn({ planId, planEpoch, minimumEpoch }, 'Plan-index epoch below minimum');
      return true;
    }
    return false;
  }

  const metadata = getPlanMetadata(doc);
  if (!metadata) {
    logger.warn({ planId }, 'Plan metadata missing - rejecting for security');
    return true;
  }

  const planEpoch = getEpochFromMetadata(metadata);
  if (!isEpochValid(planEpoch, minimumEpoch)) {
    logger.warn({ planId, planEpoch, minimumEpoch }, 'Plan epoch below minimum');
    return true;
  }
  return false;
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

    if (docName === 'plan-index') {
      const metadata = getPlanIndexMetadata(doc);
      if (!metadata) {
        initPlanIndexMetadata(doc, { epoch: registryConfig.MINIMUM_EPOCH });
        logger.info({ epoch: registryConfig.MINIMUM_EPOCH }, 'Initialized plan-index metadata');
      }
    }

    doc.on('update', (update: Uint8Array) => {
      persistence.storeUpdate(docName, update);
    });

    docs.set(docName, doc);

    const awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(docName, awareness);

    /** Attach observers for subscription notifications */
    attachObservers(docName, doc);

    /** Attach CRDT validation observers (security: validates peer sync data) */
    attachCRDTValidation(docName, doc);
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
 *
 * TOCTOU Race Condition (Time-Of-Check-Time-Of-Use):
 * A browser could close its connection between the time this check returns true
 * and the time the navigation actually occurs. This is acceptable because:
 * 1. It's a rare edge case (millisecond window)
 * 2. Opening a duplicate tab is not harmful (user can close it)
 * 3. Adding synchronization would be overly complex for this minor scenario
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

/**
 * Processes a single WebSocket message for Yjs sync protocol.
 * Handles both sync messages (document updates) and awareness messages (presence).
 */
function processMessage(
  message: Buffer,
  doc: Y.Doc,
  awareness: awarenessProtocol.Awareness,
  planId: string,
  ws: WebSocket
): void {
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
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws);
        break;
      }
      default: {
        logger.warn({ messageType, planId }, 'Unknown message type received');
        break;
      }
    }
  } catch (err) {
    logger.error({ err, planId }, 'Failed to process message');
  }
}

function handleWebSocketConnection(ws: WebSocket, req: http.IncomingMessage): void {
  const fullUrl = req.url || '/';

  /** Parse URL to extract planId and epoch query param */
  const urlParts = fullUrl.split('?');
  const planId = urlParts[0]?.slice(1) || 'default';

  let clientEpoch = DEFAULT_EPOCH;
  if (urlParts[1]) {
    const params = new URLSearchParams(urlParts[1]);
    const epochParam = params.get('epoch');
    if (epochParam) {
      const parsed = Number.parseInt(epochParam, 10);
      if (!Number.isNaN(parsed)) {
        clientEpoch = parsed;
      }
    }
  }

  /**
   * VALIDATE IMMEDIATELY - before doc load, before message buffering.
   * This is the production pattern used by Hocuspocus and y-sweet.
   * The client sends its epoch in the URL, server validates BEFORE any sync.
   */
  const minimumEpoch = registryConfig.MINIMUM_EPOCH;
  if (!isEpochValid(clientEpoch, minimumEpoch)) {
    logger.warn(
      { planId, clientEpoch, minimumEpoch },
      'Rejecting client: epoch too old (URL param)'
    );
    ws.close(EPOCH_CLOSE_CODES.EPOCH_TOO_OLD, EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]);
    return;
  }

  logger.info({ planId, clientEpoch }, 'WebSocket client connected to registry');

  /*
   * CRITICAL: Buffer for messages that arrive before doc is ready.
   * The client may send SyncStep1 immediately upon connection, but getDoc() is async.
   * Without buffering, those early messages are lost and sync fails with timeout.
   */
  const pendingMessages: Buffer[] = [];
  let docReady = false;
  let doc: Y.Doc;
  let awareness: awarenessProtocol.Awareness;

  /*
   * Attach message handler IMMEDIATELY (synchronously) to avoid missing any messages.
   * Messages received before doc initialization are buffered and processed later.
   */
  ws.on('message', (message: Buffer) => {
    if (!docReady) {
      pendingMessages.push(message);
      logger.debug(
        { planId, bufferedCount: pendingMessages.length },
        'Buffering message (doc not ready)'
      );
      return;
    }
    processMessage(message, doc, awareness, planId, ws);
  });

  /** Error handler also attached synchronously */
  ws.on('error', (err: Error) => {
    logger.error({ err, planId }, 'WebSocket error');
  });

  /** Async initialization */
  (async () => {
    try {
      doc = await getDoc(planId);

      if (shouldRejectForEpoch(doc, planId)) {
        ws.close(
          EPOCH_CLOSE_CODES.EPOCH_TOO_OLD,
          EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]
        );
        return;
      }

      const awarenessResult = awarenessMap.get(planId);
      if (!awarenessResult) {
        throw new Error(`Awareness not found for planId: ${planId}`);
      }
      awareness = awarenessResult;
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

      /** Mark doc as ready BEFORE processing buffered messages */
      docReady = true;

      /** Process any messages that arrived during initialization */
      if (pendingMessages.length > 0) {
        logger.debug({ planId, count: pendingMessages.length }, 'Processing buffered messages');
        for (const msg of pendingMessages) {
          processMessage(msg, doc, awareness, planId, ws);
        }
        pendingMessages.length = 0;
      }

      /** Send initial sync state (SyncStep1) to start handshake */
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      send(ws, encoding.toUint8Array(encoder));

      /** Send current awareness states */
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

      ws.on('close', () => {
        logger.info({ planId }, 'WebSocket client disconnected from registry');
        doc.off('update', updateHandler);
        awareness.off('update', awarenessHandler);
        conns.get(planId)?.delete(ws);
        awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
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

async function handleGetPRDiff(req: Request, res: Response): Promise<void> {
  const planId = getParam(req.params.id);
  const prNumber = getParam(req.params.prNumber);

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
    const status = getErrorStatus(error);
    res.status(status).json({ error: 'Failed to fetch PR diff' });
  }
}

async function handleGetPRFiles(req: Request, res: Response): Promise<void> {
  const planId = getParam(req.params.id);
  const prNumber = getParam(req.params.prNumber);

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
    const status = getErrorStatus(error);
    res.status(status).json({ error: 'Failed to fetch PR files' });
  }
}

async function handleGetTranscript(req: Request, res: Response): Promise<void> {
  const planId = getParam(req.params.id);
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

    const originRecord = Object.fromEntries(Object.entries(metadata.origin));
    const transcriptPath = originRecord.transcriptPath;
    if (typeof transcriptPath !== 'string' || !transcriptPath) {
      res.status(404).json({ error: 'No transcript path in origin metadata' });
      return;
    }

    const content = await readFile(transcriptPath, 'utf-8');
    res.type('text/plain').send(content);
    logger.debug({ planId, transcriptPath, size: content.length }, 'Served transcript for handoff');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      res.status(404).json({ error: 'Transcript file not found' });
    } else {
      logger.error({ error, planId }, 'Failed to read transcript');
      res.status(500).json({ error: 'Failed to read transcript' });
    }
  }
}

/** --- tRPC Context Factory --- */

/**
 * Creates the plan store adapter for tRPC context.
 * Wraps the subscription manager functions.
 */
function createPlanStore(): PlanStore {
  return {
    createSubscription: (params) => {
      /** Validate subscription topics match ChangeType values */
      const subscribe: ChangeType[] = params.subscribe.filter(
        (s): s is ChangeType =>
          s === 'status' ||
          s === 'comments' ||
          s === 'resolved' ||
          s === 'content' ||
          s === 'artifacts'
      );
      return createSubscription({
        planId: params.planId,
        subscribe,
        windowMs: params.windowMs,
        maxWindowMs: params.maxWindowMs,
        threshold: params.threshold,
      });
    },
    getChanges: (planId, clientId) => getChanges(planId, clientId),
    deleteSubscription: (planId, clientId) => deleteSubscription(planId, clientId),
    hasActiveConnections: async (planId) => hasActiveConnections(planId),
  };
}

/**
 * Creates tRPC context for each request.
 * Provides dependencies to all tRPC procedures.
 */
function createContext(): Context & {
  hookHandlers: ReturnType<typeof createHookHandlers>;
  conversationHandlers: ReturnType<typeof createConversationHandlers>;
} {
  return {
    getOrCreateDoc,
    getPlanStore: createPlanStore,
    logger,
    hookHandlers: createHookHandlers(),
    conversationHandlers: createConversationHandlers(),
    getLocalChanges,
    getFileContent,
    getMachineInfo: async () => ({
      machineId: getMachineId(),
      machineName: getMachineName(),
      ownerId: await getGitHubUsername(),
      cwd: process.cwd(),
    }),
  };
}

/**
 * Creates the Express app with tRPC middleware and remaining HTTP routes.
 *
 * Architecture note: Most routes are now handled by tRPC at /trpc.
 * Remaining Express routes:
 * - /registry: Health check
 * - /api/plan/:id/transcript: Returns raw text file (not JSON)
 * - /api/plans/:id/pr-diff/:prNumber: Returns raw diff text
 * - /api/plans/:id/pr-files/:prNumber: PR file listing
 * - WebSocket: Yjs sync protocol
 */
function createApp(): { app: express.Express; httpServer: http.Server } {
  const app = express();
  const httpServer = http.createServer(app);

  /*
   * CORS headers FIRST - apply to ALL responses including errors
   * This MUST come before body-parser so error responses (like 413) get CORS headers
   */
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  /*
   * Handle OPTIONS preflight requests
   * Note: Express 5 uses path-to-regexp v8 which requires named wildcards
   */
  app.options('{*splat}', (_req, res) => {
    res.sendStatus(204);
  });

  /** Body parser AFTER CORS - 10mb limit for large conversation imports */
  app.use(express.json({ limit: '10mb' }));

  /** tRPC middleware - handles all migrated routes */
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  /** Health check endpoint - used by browser and hook to discover if server is running */
  app.get('/registry', handleHealthCheck);

  /** Connection status endpoint - used by hub-client to check for active browser connections */
  app.get('/api/plan/:planId/has-connections', (req, res) => {
    const planId = req.params.planId;
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }
    const hasConnections = hasActiveConnections(planId);
    res.json({ hasConnections });
  });

  /** Remaining Express routes (non-JSON responses or special handling) */
  app.get('/api/plan/:id/transcript', handleGetTranscript);
  app.get('/api/plans/:id/pr-diff/:prNumber', handleGetPRDiff);
  app.get('/api/plans/:id/pr-files/:prNumber', handleGetPRFiles);

  /** Artifact serving endpoint with path traversal protection */
  app.get('/artifacts/:planId/:filename', async (req: Request, res: Response): Promise<void> => {
    const planId = getParam(req.params.planId);
    const filename = getParam(req.params.filename);

    if (!planId || !filename) {
      res.status(400).json({ error: 'Missing planId or filename' });
      return;
    }

    /** Path traversal protection: resolve full path and verify it's within artifacts directory */
    const ARTIFACTS_DIR = join(registryConfig.SHIPYARD_STATE_DIR, 'artifacts');
    const fullPath = resolve(ARTIFACTS_DIR, planId, filename);

    if (!fullPath.startsWith(ARTIFACTS_DIR + sep)) {
      res.status(400).json({ error: 'Invalid artifact path' });
      return;
    }

    /** Read file directly using resolved path */
    const buffer = await readFile(fullPath).catch(() => null);

    if (!buffer) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    /** Content-Type affects browser rendering (inline vs download) */
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      mp4: 'video/mp4',
      webm: 'video/webm',
      json: 'application/json',
      txt: 'text/plain',
    };
    const contentType = mimeTypes[ext || ''] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  });

  return { app, httpServer };
}

export async function startRegistryServer(): Promise<number | null> {
  const ports = registryConfig.REGISTRY_PORT;

  const { httpServer } = createApp();

  /** Create WebSocket server with noServer mode for upgrade handling */
  const wss = new WebSocketServer({ noServer: true });

  /** Handle HTTP upgrade requests for WebSocket connections */
  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  /** Handle WebSocket connections */
  wss.on('connection', handleWebSocketConnection);

  /** Register signal handlers for graceful shutdown with lock cleanup */
  process.once('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    const { stopPeriodicCleanup } = await import('./session-registry.js');
    stopPeriodicCleanup();
    await releaseHubLock();
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    const { stopPeriodicCleanup } = await import('./session-registry.js');
    stopPeriodicCleanup();
    await releaseHubLock();
    process.exit(0);
  });

  for (const port of ports) {
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.listen(port, '127.0.0.1', () => {
          logger.info(
            { port, persistence: PERSISTENCE_DIR },
            'Registry server started with WebSocket and tRPC support'
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
    } catch (err) {
      logger.debug({ err, port }, 'Port unavailable or server failed to start');
    }
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
