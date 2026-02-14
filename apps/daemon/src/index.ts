#!/usr/bin/env bun

import { mkdir } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { change, type createTypedDoc } from '@loro-extended/change';
import { Repo } from '@loro-extended/repo';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  EpochDocumentSchema,
  generateTaskId,
  TaskDocumentSchema,
} from '@shipyard/loro-schema';
import { PersonalRoomConnection } from '@shipyard/session';
import { detectCapabilities } from './capabilities.js';
import { type Env, validateEnv } from './env.js';
import { FileStorageAdapter } from './file-storage-adapter.js';
import { LifecycleManager } from './lifecycle.js';
import { createChildLogger, logger } from './logger.js';
import { SessionManager, type SessionResult } from './session-manager.js';
import { createDaemonSignaling, type DaemonSignaling } from './signaling.js';

interface CliArgs {
  prompt?: string;
  resume?: string;
  taskId?: string;
  cwd?: string;
  dataDir?: string;
  model?: string;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', short: 'p' },
      'task-id': { type: 'string', short: 't' },
      resume: { type: 'string', short: 'r' },
      'data-dir': { type: 'string', short: 'd' },
      cwd: { type: 'string' },
      model: { type: 'string', short: 'm' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    logger.info(
      [
        'shipyard-daemon - Claude Agent SDK + Loro CRDT sync',
        '',
        'Usage:',
        '  shipyard-daemon --prompt "Fix the bug in auth.ts" [options]',
        '  shipyard-daemon --resume <session-id> --task-id <id> [--prompt "Continue"]',
        '',
        'Options:',
        '  -p, --prompt <text>      Prompt for the agent',
        '  -t, --task-id <id>       Task ID (auto-generated if not provided)',
        '  -r, --resume <id>        Resume session by session ID',
        '  -d, --data-dir <path>    Data directory (default: ~/.shipyard/data)',
        '      --cwd <path>         Working directory for agent',
        '  -m, --model <name>       Model to use',
        '  -h, --help               Show this help',
        '',
        'Environment:',
        '  ANTHROPIC_API_KEY         Required. API key for Claude.',
        '  SHIPYARD_DATA_DIR         Data directory (overridden by --data-dir)',
        '  LOG_LEVEL                 Log level: debug, info, warn, error (default: info)',
        '  SHIPYARD_SIGNALING_URL    Signaling server WebSocket URL (optional)',
        '  SHIPYARD_USER_TOKEN       JWT for signaling auth (optional)',
        '  SHIPYARD_MACHINE_ID       Machine identifier (default: os.hostname())',
        '  SHIPYARD_MACHINE_NAME     Human-readable machine name (default: os.hostname())',
      ].join('\n')
    );
    process.exit(0);
  }

  return {
    prompt: values.prompt,
    resume: values.resume,
    taskId: values['task-id'],
    cwd: values.cwd,
    dataDir: values['data-dir'],
    model: values.model,
  };
}

interface SignalingHandle {
  signaling: DaemonSignaling;
  connection: PersonalRoomConnection;
}

async function setupSignaling(
  env: Env,
  log: ReturnType<typeof createChildLogger>
): Promise<SignalingHandle | null> {
  if (!env.SHIPYARD_SIGNALING_URL) {
    return null;
  }

  const machineId = env.SHIPYARD_MACHINE_ID ?? hostname();
  const machineName = env.SHIPYARD_MACHINE_NAME ?? hostname();
  const wsUrl = new URL(env.SHIPYARD_SIGNALING_URL);
  if (env.SHIPYARD_USER_TOKEN) {
    wsUrl.searchParams.set('token', env.SHIPYARD_USER_TOKEN);
  }

  const capabilities = await detectCapabilities({ cwd: process.cwd() });
  log.info(
    { models: capabilities.models.length, environments: capabilities.environments.length },
    'Detected machine capabilities'
  );

  const connection = new PersonalRoomConnection({ url: wsUrl.toString() });
  const signaling = createDaemonSignaling({
    connection,
    machineId,
    machineName,
    agentType: 'daemon',
    capabilities,
  });

  connection.onStateChange((state) => {
    if (state === 'connected') {
      signaling.register();
      log.info({ machineId, machineName }, 'Registered with signaling server');
    }
  });
  connection.connect();

  return { signaling, connection };
}

async function setupRepo(dataDir: string) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const storage = new FileStorageAdapter(dataDir);
  const repo = new Repo({
    identity: { name: 'shipyard-daemon' },
    adapters: [storage],
  });
  return repo;
}

async function loadEpoch(repo: Repo): Promise<number> {
  const epochHandle = repo.get('epoch', EpochDocumentSchema);

  try {
    await epochHandle.waitForSync({ kind: 'storage', timeout: 5_000 });
  } catch {
    logger.debug('No existing epoch data in storage');
  }

  if (epochHandle.loroDoc.opCount() === 0) {
    change(epochHandle.doc, (draft) => {
      draft.schema.version = DEFAULT_EPOCH;
    });
    logger.debug({ epoch: DEFAULT_EPOCH }, 'Initialized epoch document');
    return DEFAULT_EPOCH;
  }

  return epochHandle.doc.toJSON().schema.version;
}

async function loadTaskDoc(repo: Repo, taskDocId: string, taskId: string, prompt?: string) {
  const taskHandle = repo.get(taskDocId, TaskDocumentSchema);

  try {
    await taskHandle.waitForSync({ kind: 'storage', timeout: 5_000 });
  } catch {
    logger.debug({ taskDocId }, 'No existing task data in storage (new task)');
  }

  if (taskHandle.loroDoc.opCount() === 0) {
    initializeTaskDoc(taskHandle.doc, taskId, prompt);
    logger.debug({ taskDocId }, 'Initialized new task document');
  }

  return taskHandle;
}

function initializeTaskDoc(
  doc: ReturnType<typeof createTypedDoc<typeof TaskDocumentSchema>>,
  taskId: string,
  prompt?: string
): void {
  const now = Date.now();
  change(doc, (draft) => {
    draft.meta.id = taskId;
    draft.meta.title = prompt?.slice(0, 80) ?? 'Untitled task';
    draft.meta.status = 'submitted';
    draft.meta.createdAt = now;
    draft.meta.updatedAt = now;
  });
}

function handleResult(
  log: ReturnType<typeof createChildLogger>,
  result: SessionResult,
  startTime: number
): void {
  const wallTimeMs = Date.now() - startTime;
  log.info(
    {
      sessionId: result.sessionId,
      agentSessionId: result.agentSessionId,
      status: result.status,
      totalCostUsd: result.totalCostUsd,
      durationMs: result.durationMs,
      wallTimeMs,
    },
    'Session complete'
  );

  if (result.resultText) {
    log.info({ resultText: result.resultText }, 'Agent result');
  }
}

async function main(): Promise<void> {
  const env = validateEnv();
  const args = parseCliArgs();

  if (!args.prompt && !args.resume) {
    logger.error('Either --prompt or --resume is required. Use --help for usage.');
    process.exit(1);
  }

  const dataDir = resolve(args.dataDir ?? env.SHIPYARD_DATA_DIR.replace('~', homedir()));
  const taskId = args.taskId ?? generateTaskId();
  const log = createChildLogger({ taskId });

  log.info({ dataDir, prompt: args.prompt, resume: args.resume }, 'Starting daemon');

  const repo = await setupRepo(dataDir);
  const lifecycle = new LifecycleManager();
  const signalingHandle = await setupSignaling(env, log);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    signalingHandle?.signaling.unregister();
    signalingHandle?.signaling.destroy();
    signalingHandle?.connection.disconnect();
    lifecycle.destroy();
    repo.reset();
  };

  lifecycle.onShutdown(async () => {
    log.info('Cleaning up...');
    cleanup();
  });

  const epoch = await loadEpoch(repo);
  const taskDocId = buildDocumentId('task', taskId, epoch);
  log.info({ taskDocId, epoch }, 'Using task document');

  const taskHandle = await loadTaskDoc(repo, taskDocId, taskId, args.prompt);
  const manager = new SessionManager(taskHandle.doc);
  const abortController = lifecycle.createAbortController();
  const startTime = Date.now();

  try {
    const result = args.resume
      ? await manager.resumeSession(args.resume, args.prompt ?? 'Continue.', { abortController })
      : await manager.createSession({
          prompt: args.prompt ?? '',
          cwd: args.cwd ?? process.cwd(),
          model: args.model,
          abortController,
        });

    handleResult(log, result, startTime);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    log.error({ err: errMsg, stack: errStack }, 'Session failed');
    cleanup();
    process.exit(1);
  }

  cleanup();
}

main().catch((error: unknown) => {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errStack = error instanceof Error ? error.stack : undefined;
  logger.error({ err: errMsg, stack: errStack }, 'Fatal error');
  process.exit(1);
});
