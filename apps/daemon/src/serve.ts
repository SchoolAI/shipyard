import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import { change, type createTypedDoc } from '@loro-extended/change';
import { Repo } from '@loro-extended/repo';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  EpochDocumentSchema,
  TaskDocumentSchema,
} from '@shipyard/loro-schema';
import type { PersonalRoomServerMessage } from '@shipyard/session';
import type { Env } from './env.js';
import { FileStorageAdapter } from './file-storage-adapter.js';
import { LifecycleManager } from './lifecycle.js';
import { createChildLogger, logger } from './logger.js';
import {
  createPeerManager,
  type ICECandidate,
  type PeerManager,
  type SDPDescription,
} from './peer-manager.js';
import { SessionManager, type SessionResult } from './session-manager.js';
import type { DaemonSignaling } from './signaling.js';
import { createSignalingHandle } from './signaling-setup.js';

function assertNever(x: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(x)}`);
}

interface ActiveTask {
  taskId: string;
  abortController: AbortController;
}

/**
 * Run the daemon in serve mode: connect to signaling, register capabilities,
 * and stay alive waiting for spawn-agent messages.
 *
 * The process stays alive until SIGINT or SIGTERM is received, at which point
 * LifecycleManager gracefully shuts down and exits.
 */
export async function serve(env: Env): Promise<void> {
  if (!env.SHIPYARD_SIGNALING_URL) {
    logger.error('SHIPYARD_SIGNALING_URL is required for serve mode');
    process.exit(1);
  }

  const log = createChildLogger({ mode: 'serve' });
  const lifecycle = new LifecycleManager();

  const handle = await createSignalingHandle(env, log);
  if (!handle) {
    logger.error('SHIPYARD_SIGNALING_URL is required for serve mode');
    process.exit(1);
  }

  const { signaling, connection } = handle;
  const activeTasks = new Map<string, ActiveTask>();

  const dataDir = resolve(env.SHIPYARD_DATA_DIR.replace('~', homedir()));
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const storage = new FileStorageAdapter(dataDir);
  const webrtcAdapter = new WebRtcDataChannelAdapter();
  const repo = new Repo({
    identity: { name: 'shipyard-daemon' },
    adapters: [storage, webrtcAdapter],
  });

  const peerManager = createPeerManager({
    webrtcAdapter,
    onAnswer(targetMachineId, answer) {
      connection.send({
        type: 'webrtc-answer',
        targetMachineId,
        answer,
      });
    },
    onIceCandidate(targetMachineId, candidate) {
      connection.send({
        type: 'webrtc-ice',
        targetMachineId,
        candidate,
      });
    },
  });

  connection.onStateChange((state) => {
    log.info({ state }, 'Connection state changed');
  });

  connection.onMessage((msg) => {
    handleMessage(msg, {
      log,
      signaling,
      connection,
      repo,
      lifecycle,
      activeTasks,
      peerManager,
      env,
    });
  });

  connection.connect();

  log.info('Daemon running in serve mode, waiting for tasks...');

  lifecycle.onShutdown(async () => {
    log.info('Shutting down serve mode...');

    for (const task of activeTasks.values()) {
      task.abortController.abort();
    }
    activeTasks.clear();

    peerManager.destroy();
    signaling.unregister();
    await new Promise((resolve) => setTimeout(resolve, 200));
    signaling.destroy();
    connection.disconnect();
    repo.reset();
  });

  /** Block forever. LifecycleManager handles SIGINT/SIGTERM and calls process.exit(0). */
  await new Promise<never>(() => {});
}

interface MessageHandlerContext {
  log: ReturnType<typeof createChildLogger>;
  signaling: DaemonSignaling;
  connection: { send: (msg: import('@shipyard/session').PersonalRoomClientMessage) => void };
  repo: Repo;
  lifecycle: LifecycleManager;
  activeTasks: Map<string, ActiveTask>;
  peerManager: PeerManager;
  env: Env;
}

function handleMessage(msg: PersonalRoomServerMessage, ctx: MessageHandlerContext): void {
  switch (msg.type) {
    case 'agents-list':
      ctx.log.info({ count: msg.agents.length }, 'Agents online');
      break;

    case 'spawn-agent':
      handleSpawnAgent(msg, ctx);
      break;

    case 'webrtc-offer':
      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
      ctx.peerManager
        .handleOffer(msg.targetMachineId, msg.offer as SDPDescription)
        .catch((err: unknown) => {
          ctx.log.error({ err, from: msg.targetMachineId }, 'Failed to handle WebRTC offer');
        });
      break;

    case 'webrtc-answer':
      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
      ctx.peerManager
        .handleAnswer(msg.targetMachineId, msg.answer as SDPDescription)
        .catch((err: unknown) => {
          ctx.log.error({ err, from: msg.targetMachineId }, 'Failed to handle WebRTC answer');
        });
      break;

    case 'webrtc-ice':
      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
      ctx.peerManager
        .handleIce(msg.targetMachineId, msg.candidate as ICECandidate)
        .catch((err: unknown) => {
          ctx.log.error({ err, from: msg.targetMachineId }, 'Failed to handle WebRTC ICE');
        });
      break;

    case 'spawn-result':
      ctx.log.debug({ requestId: msg.requestId, taskId: msg.taskId }, 'Received spawn-result echo');
      break;

    case 'authenticated':
    case 'agent-joined':
    case 'agent-left':
    case 'agent-status-changed':
    case 'agent-capabilities-changed':
    case 'error':
      ctx.log.debug({ type: msg.type }, 'Server notification');
      break;

    default:
      assertNever(msg);
  }
}

function handleSpawnAgent(
  msg: Extract<PersonalRoomServerMessage, { type: 'spawn-agent' }>,
  ctx: MessageHandlerContext
): void {
  const { taskId, prompt, requestId } = msg;
  const cwd = msg.cwd ?? process.cwd();
  const taskLog = createChildLogger({ mode: 'serve', taskId });

  if (!ctx.env.ANTHROPIC_API_KEY) {
    taskLog.error('ANTHROPIC_API_KEY is required to spawn agents');
    ctx.connection.send({
      type: 'spawn-result',
      requestId,
      taskId,
      success: false,
      error: 'ANTHROPIC_API_KEY not configured on daemon',
    });
    return;
  }

  if (ctx.activeTasks.has(taskId)) {
    taskLog.warn('Task already active, ignoring duplicate spawn');
    ctx.connection.send({
      type: 'spawn-result',
      requestId,
      taskId,
      success: false,
      error: 'Task already running',
    });
    return;
  }

  taskLog.info({ prompt: prompt.slice(0, 100) }, 'Spawn agent requested');

  const abortController = ctx.lifecycle.createAbortController();
  ctx.activeTasks.set(taskId, { taskId, abortController });

  ctx.connection.send({
    type: 'spawn-result',
    requestId,
    taskId,
    success: true,
  });

  ctx.signaling.updateStatus('running', taskId);

  runTask({
    repo: ctx.repo,
    taskId,
    prompt,
    cwd,
    abortController,
    log: taskLog,
  })
    .then((result) => {
      taskLog.info(
        {
          sessionId: result.sessionId,
          status: result.status,
          totalCostUsd: result.totalCostUsd,
          durationMs: result.durationMs,
        },
        'Task complete'
      );
    })
    .catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      taskLog.error({ err: errMsg }, 'Task failed');
    })
    .finally(() => {
      ctx.activeTasks.delete(taskId);
      ctx.signaling.updateStatus('idle');
    });
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
    return DEFAULT_EPOCH;
  }

  return epochHandle.doc.toJSON().schema.version;
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

interface RunTaskOptions {
  repo: Repo;
  taskId: string;
  prompt: string;
  cwd: string;
  abortController: AbortController;
  log: ReturnType<typeof createChildLogger>;
}

async function runTask(opts: RunTaskOptions): Promise<SessionResult> {
  const { repo, taskId, prompt, cwd, abortController, log } = opts;

  const epoch = await loadEpoch(repo);
  const taskDocId = buildDocumentId('task', taskId, epoch);
  log.info({ taskDocId, epoch }, 'Using task document');

  const taskHandle = repo.get(taskDocId, TaskDocumentSchema);

  try {
    await taskHandle.waitForSync({ kind: 'storage', timeout: 5_000 });
  } catch {
    log.debug({ taskDocId }, 'No existing task data in storage (new task)');
  }

  if (taskHandle.loroDoc.opCount() === 0) {
    initializeTaskDoc(taskHandle.doc, taskId, prompt);
    log.debug({ taskDocId }, 'Initialized new task document');
  }

  const manager = new SessionManager(taskHandle.doc);
  return manager.createSession({
    prompt,
    cwd,
    abortController,
  });
}
