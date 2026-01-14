import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  type A2AMessage,
  a2aToClaudeCode,
  type ConversationExportMeta,
  CreateSubscriptionRequestSchema,
  formatAsClaudeCodeJSONL,
  getPlanMetadata,
  RegisterServerRequestSchema,
  UnregisterServerRequestSchema,
} from '@peer-plan/schema';
import express, { type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { WebSocket } from 'ws';
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
  type ChangeType,
  createSubscription,
  deleteSubscription,
  getChanges,
  startCleanupInterval,
} from './subscriptions/index.js';
import { getOrCreateDoc } from './ws-server.js';

const DEFAULT_REGISTRY_PORTS = [32191, 32192];

const HEALTH_CHECK_INTERVAL = 10000;
const HEALTH_CHECK_TIMEOUT = 2000;

interface ServerEntry {
  port: number;
  pid: number;
  url: string;
  registeredAt: number;
}

const servers = new Map<number, ServerEntry>();

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

async function handleGetRegistry(_req: Request, res: Response): Promise<void> {
  const serverList = Array.from(servers.values());
  logger.debug({ count: serverList.length }, 'Served registry');
  res.json({ servers: serverList });
}

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

function createApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.get('/registry', handleGetRegistry);
  app.post('/register', handleRegister);
  app.delete('/unregister', handleUnregister);

  app.get('/api/plan/:id/status', handlePlanStatus);
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

  return app;
}

export async function startRegistryServer(): Promise<number | null> {
  const ports = process.env.REGISTRY_PORT
    ? [Number.parseInt(process.env.REGISTRY_PORT, 10)]
    : DEFAULT_REGISTRY_PORTS;

  const app = createApp();

  for (const port of ports) {
    try {
      await new Promise<void>((resolve, reject) => {
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
    } catch {}
  }

  logger.warn({ ports }, 'All registry ports in use');
  return null;
}

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
    } catch {}
  }

  return null;
}
