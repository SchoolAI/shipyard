import { mkdir } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import { change } from '@loro-extended/change';
import type { HandleWithEphemerals } from '@loro-extended/repo';
import { Repo } from '@loro-extended/repo';
import {
  buildDocumentId,
  classifyToolRisk,
  DEFAULT_EPOCH,
  EpochDocumentSchema,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  TaskDocumentSchema,
  type TaskDocumentShape,
} from '@shipyard/loro-schema';
import type { PersonalRoomServerMessage } from '@shipyard/session';
import { createBranchWatcher } from './branch-watcher.js';
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

/**
 * Ephemeral namespace declarations for task documents.
 * permReqs: daemon writes pending tool permission requests (browser reads)
 * permResps: browser writes permission decisions (daemon reads)
 */
const TaskEphemeralDeclarations = {
  permReqs: PermissionRequestEphemeral,
  permResps: PermissionResponseEphemeral,
};

type TaskEphemeralDecls = typeof TaskEphemeralDeclarations;
type TaskHandle = HandleWithEphemerals<TaskDocumentShape, TaskEphemeralDecls>;

interface ActiveTask {
  taskId: string;
  abortController: AbortController;
}

/**
 * Run the daemon in serve mode: connect to signaling, register capabilities,
 * and stay alive waiting for task notifications via CRDT subscriptions.
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

  const { signaling, connection, capabilities } = handle;
  const activeTasks = new Map<string, ActiveTask>();
  const watchedTasks = new Map<string, () => void>();

  const machineId = env.SHIPYARD_MACHINE_ID ?? hostname();

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

  const branchWatcher = createBranchWatcher({
    environments: capabilities.environments,
    onUpdate: (updatedEnvs) => {
      capabilities.environments = updatedEnvs;
      signaling.updateCapabilities({ ...capabilities });
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
      watchedTasks,
      peerManager,
      env,
      machineId,
    });
  });

  connection.connect();

  log.info('Daemon running in serve mode, waiting for tasks...');

  lifecycle.onShutdown(async () => {
    log.info('Shutting down serve mode...');

    branchWatcher.close();

    for (const task of activeTasks.values()) {
      task.abortController.abort();
    }
    activeTasks.clear();
    for (const unsub of watchedTasks.values()) {
      unsub();
    }
    watchedTasks.clear();

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
  watchedTasks: Map<string, () => void>;
  peerManager: PeerManager;
  env: Env;
  machineId: string;
}

function handleMessage(msg: PersonalRoomServerMessage, ctx: MessageHandlerContext): void {
  switch (msg.type) {
    case 'agents-list':
      ctx.log.info({ count: msg.agents.length }, 'Agents online');
      break;

    case 'notify-task':
      handleNotifyTask(msg, ctx);
      break;

    case 'task-ack':
      ctx.log.debug({ requestId: msg.requestId, taskId: msg.taskId }, 'Received task-ack echo');
      break;

    case 'webrtc-offer': {
      const offerFrom = msg.fromMachineId ?? msg.targetMachineId;
      ctx.log.debug({ from: offerFrom }, 'Received WebRTC offer');
      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
      ctx.peerManager.handleOffer(offerFrom, msg.offer as SDPDescription).catch((err: unknown) => {
        ctx.log.error({ err, from: offerFrom }, 'Failed to handle WebRTC offer');
      });
      break;
    }

    case 'webrtc-answer': {
      const answerFrom = msg.fromMachineId ?? msg.targetMachineId;
      ctx.log.debug({ from: answerFrom }, 'Received WebRTC answer');
      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
      ctx.peerManager
        .handleAnswer(answerFrom, msg.answer as SDPDescription)
        .catch((err: unknown) => {
          ctx.log.error({ err, from: answerFrom }, 'Failed to handle WebRTC answer');
        });
      break;
    }

    case 'webrtc-ice': {
      const iceFrom = msg.fromMachineId ?? msg.targetMachineId;
      ctx.log.debug({ from: iceFrom }, 'Received WebRTC ICE candidate');
      // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
      ctx.peerManager.handleIce(iceFrom, msg.candidate as ICECandidate).catch((err: unknown) => {
        ctx.log.error({ err, from: iceFrom }, 'Failed to handle WebRTC ICE');
      });
      break;
    }

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

/**
 * Handle a notify-task message from the browser (relayed via signaling).
 *
 * This is a content-free discovery signal. The browser sends it when:
 * 1. A new task is created (primary trigger for daemon to start watching)
 * 2. Daemon restarts and browser re-sends for active tasks (recovery)
 *
 * The daemon responds with task-ack and begins watching the task document.
 */
function handleNotifyTask(
  msg: Extract<PersonalRoomServerMessage, { type: 'notify-task' }>,
  ctx: MessageHandlerContext
): void {
  const { taskId, requestId } = msg;
  const taskLog = createChildLogger({ mode: 'serve', taskId });

  if (!ctx.env.ANTHROPIC_API_KEY) {
    taskLog.error('ANTHROPIC_API_KEY is required to run agents');
    ctx.connection.send({
      type: 'task-ack',
      requestId,
      taskId,
      accepted: false,
      error: 'ANTHROPIC_API_KEY not configured on daemon',
    });
    return;
  }

  if (ctx.watchedTasks.has(taskId)) {
    taskLog.debug('Task already watched, sending ack');
    ctx.connection.send({
      type: 'task-ack',
      requestId,
      taskId,
      accepted: true,
    });
    return;
  }

  taskLog.info('Received notify-task, starting watch');

  ctx.connection.send({
    type: 'task-ack',
    requestId,
    taskId,
    accepted: true,
  });

  watchTaskDocument(taskId, taskLog, ctx).catch((err: unknown) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    taskLog.error({ err: errMsg }, 'Failed to start watching task document');
  });
}

/**
 * Subscribe to a task document's conversation changes and react when
 * a new user message arrives.
 *
 * Detection algorithm:
 * 1. Get the task handle from the repo (triggers Loro new-doc sync if needed)
 * 2. Wait for storage sync to load any persisted state
 * 3. Subscribe to the conversation list via the handle's path-based subscription
 * 4. On each change where data was imported (remote):
 *    - Check if last message role === 'user' AND meta.status !== 'working'
 *    - Read config for model/cwd/permissionMode
 *    - Check sessions: empty -> createSession(), has agentSessionId -> resumeSession()
 *    - Set meta.status = 'working'
 */
async function watchTaskDocument(
  taskId: string,
  taskLog: ReturnType<typeof createChildLogger>,
  ctx: MessageHandlerContext
): Promise<void> {
  const epoch = await loadEpoch(ctx.repo);
  const taskDocId = buildDocumentId('task', taskId, epoch);
  taskLog.info({ taskDocId, epoch }, 'Watching task document');

  const taskHandle = ctx.repo.get(taskDocId, TaskDocumentSchema, TaskEphemeralDeclarations);

  try {
    await taskHandle.waitForSync({ kind: 'storage', timeout: 5_000 });
  } catch {
    taskLog.debug({ taskDocId }, 'No existing task data in storage');
  }

  const opCountBefore = taskHandle.loroDoc.opCount();
  taskLog.info({ taskDocId, opCount: opCountBefore }, 'Doc state before subscribe');

  const unsubscribe = taskHandle.subscribe((event) => {
    taskLog.info({ taskDocId, eventBy: event.by }, 'Subscription event received');
    if (event.by === 'local') return;

    onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
  });

  ctx.watchedTasks.set(taskId, unsubscribe);
  taskLog.info({ taskDocId }, 'Subscribed to task document changes');

  /**
   * Also check immediately in case the doc already has a pending user message
   * (daemon restart scenario where the browser already wrote the message).
   */
  const opCountAfter = taskHandle.loroDoc.opCount();
  taskLog.info({ taskDocId, opCount: opCountAfter }, 'Doc state after subscribe');
  if (opCountAfter > 0) {
    const json = taskHandle.doc.toJSON();
    taskLog.info(
      { taskDocId, status: json.meta.status, conversationLen: json.conversation.length },
      'Checking existing doc data'
    );
    onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
  }
}

/**
 * Called when a task document changes (from a remote import).
 * Checks if there is new work to do and dispatches accordingly.
 */
function onTaskDocChanged(
  taskId: string,
  taskHandle: TaskHandle,
  taskLog: ReturnType<typeof createChildLogger>,
  ctx: MessageHandlerContext
): void {
  const doc = taskHandle.doc;
  const json = doc.toJSON();

  taskLog.info(
    {
      status: json.meta.status,
      conversationLen: json.conversation.length,
      lastRole: json.conversation[json.conversation.length - 1]?.role,
      isActive: ctx.activeTasks.has(taskId),
    },
    'onTaskDocChanged evaluation'
  );

  if (json.meta.status === 'working' || json.meta.status === 'input-required') {
    taskLog.debug({ status: json.meta.status }, 'Status blocks new work, skipping');
    return;
  }

  const conversation = json.conversation;
  if (conversation.length === 0) {
    taskLog.debug('No conversation messages, skipping');
    return;
  }

  const lastMessage = conversation[conversation.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return;
  }

  if (ctx.activeTasks.has(taskId)) {
    taskLog.debug('Task already running, skipping');
    return;
  }

  taskLog.info('New user message detected, starting agent');

  const config = json.config;
  const cwd = config.cwd ?? process.cwd();
  const model = config.model ?? undefined;
  const permissionMode = mapPermissionMode(config.permissionMode);
  const effort = config.reasoningEffort ?? undefined;

  const abortController = ctx.lifecycle.createAbortController();

  const activeTask: ActiveTask = { taskId, abortController };
  ctx.activeTasks.set(taskId, activeTask);

  ctx.signaling.updateStatus('running', taskId);

  runTask({
    taskHandle,
    taskId,
    cwd,
    model,
    permissionMode,
    effort,
    machineId: ctx.machineId,
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
      abortController.abort();

      for (const [key] of taskHandle.permReqs.getAll()) {
        taskHandle.permReqs.delete(key);
      }
      for (const [key] of taskHandle.permResps.getAll()) {
        taskHandle.permResps.delete(key);
      }

      ctx.activeTasks.delete(taskId);
      const unsub = ctx.watchedTasks.get(taskId);
      if (unsub) {
        unsub();
        ctx.watchedTasks.delete(taskId);
      }
      ctx.signaling.updateStatus('idle');
    });
}

/**
 * Map the CRDT permission mode string to the Agent SDK PermissionMode type.
 */
function mapPermissionMode(
  mode: string | null
): 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | undefined {
  switch (mode) {
    case 'accept-edits':
      return 'acceptEdits';
    case 'plan':
      return 'plan';
    case 'bypass':
      return 'bypassPermissions';
    case 'default':
      return 'default';
    default:
      return undefined;
  }
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

/**
 * Build a canUseTool callback that tunnels permission requests to the browser
 * via Loro ephemeral state and waits for the browser's response.
 *
 * Flow:
 * 1. Daemon writes a PermissionRequest to the permReqs ephemeral namespace (keyed by toolUseID)
 * 2. Daemon sets task status to 'input-required' via CRDT
 * 3. Daemon subscribes to permResps ephemeral namespace for the matching toolUseID
 * 4. Browser reads permReqs, shows UI, writes decision to permResps
 * 5. Daemon receives the response, cleans up ephemeral entries, resolves the promise
 *
 * Concurrent safety: Each tool call gets its own toolUseID key, so multiple
 * concurrent canUseTool calls do not interfere with each other.
 */
function buildCanUseTool(
  taskHandle: TaskHandle,
  taskLog: ReturnType<typeof createChildLogger>
): CanUseTool {
  return async (toolName, input, options) => {
    const { signal, toolUseID, blockedPath, decisionReason, agentID } = options;

    if (signal.aborted) {
      return { behavior: 'deny', message: 'Task was aborted' };
    }

    const riskLevel = classifyToolRisk(toolName, input);

    taskHandle.permReqs.set(toolUseID, {
      toolName,
      toolInput: JSON.stringify(input),
      riskLevel,
      reason: decisionReason ?? null,
      blockedPath: blockedPath ?? null,
      description: null,
      agentId: agentID ?? null,
      createdAt: Date.now(),
    });

    change(taskHandle.doc, (draft) => {
      draft.meta.status = 'input-required';
      draft.meta.updatedAt = Date.now();
    });

    taskLog.info({ toolName, toolUseID, riskLevel }, 'Permission request sent to browser');

    return new Promise<PermissionResult>((resolve) => {
      let unsub: (() => void) | undefined;

      const onAbort = () => {
        unsub?.();
        taskHandle.permReqs.delete(toolUseID);
        resolve({ behavior: 'deny', message: 'Task was aborted' });
      };

      signal.addEventListener('abort', onAbort, { once: true });

      unsub = taskHandle.permResps.subscribe(({ key, value, source }) => {
        if (source === 'local') return;
        if (key !== toolUseID || !value) return;

        unsub?.();
        signal.removeEventListener('abort', onAbort);

        taskHandle.permReqs.delete(toolUseID);
        taskHandle.permResps.delete(toolUseID);

        change(taskHandle.doc, (draft) => {
          draft.meta.status = 'working';
          draft.meta.updatedAt = Date.now();
        });

        taskLog.info(
          { toolName, toolUseID, decision: value.decision },
          'Permission response received'
        );

        if (value.decision === 'approved') {
          resolve({ behavior: 'allow' });
        } else {
          resolve({
            behavior: 'deny',
            message: value.message ?? 'User denied permission',
          });
        }
      });
    });
  };
}

interface RunTaskOptions {
  taskHandle: TaskHandle;
  taskId: string;
  cwd: string;
  model?: string;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  effort?: 'low' | 'medium' | 'high';
  machineId: string;
  abortController: AbortController;
  log: ReturnType<typeof createChildLogger>;
}

async function runTask(opts: RunTaskOptions): Promise<SessionResult> {
  const {
    taskHandle,
    taskId,
    cwd,
    model,
    permissionMode,
    effort,
    machineId,
    abortController,
    log,
  } = opts;

  const manager = new SessionManager(taskHandle.doc);
  const prompt = manager.getLatestUserPrompt();
  if (!prompt) {
    throw new Error(`No user message found in task ${taskId}`);
  }

  log.info({ prompt: prompt.slice(0, 100) }, 'Running task with prompt from CRDT');

  const canUseTool =
    permissionMode === 'bypassPermissions' ? undefined : buildCanUseTool(taskHandle, log);

  const resumeInfo = manager.shouldResume();
  if (resumeInfo.resume && resumeInfo.sessionId) {
    log.info({ sessionId: resumeInfo.sessionId }, 'Resuming existing session');
    return manager.resumeSession(resumeInfo.sessionId, prompt, {
      abortController,
      machineId,
      model,
      permissionMode,
      effort,
      canUseTool,
      allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
    });
  }

  return manager.createSession({
    prompt,
    cwd,
    machineId,
    model,
    permissionMode,
    effort,
    abortController,
    canUseTool,
    allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
  });
}
