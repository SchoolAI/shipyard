import { mkdir } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import { change, type TypedDoc } from '@loro-extended/change';
import type { HandleWithEphemerals } from '@loro-extended/repo';
import { Repo } from '@loro-extended/repo';
import {
  buildDocumentId,
  classifyToolRisk,
  DEFAULT_EPOCH,
  LOCAL_USER_ID,
  type MachineCapabilitiesEphemeralValue,
  type PermissionDecision,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskDocumentSchema,
  type TaskDocumentShape,
  TaskIndexDocumentSchema,
  type TaskIndexDocumentShape,
  updateTaskInIndex,
} from '@shipyard/loro-schema';
import type { MachineCapabilities, PersonalRoomServerMessage } from '@shipyard/session';
import { SignalingClient } from '@shipyard/session/client';
import { type BranchWatcher, createBranchWatcher } from './branch-watcher.js';
import {
  captureTreeSnapshot,
  detectEnvironments,
  getBranchDiff,
  getBranchFiles,
  getChangedFiles,
  getDefaultBranch,
  getRepoMetadata,
  getSnapshotDiff,
  getSnapshotFiles,
  getStagedDiff,
  getUnstagedDiff,
} from './capabilities.js';
import type { Env } from './env.js';
import { getShipyardHome } from './env.js';
import { FileStorageAdapter } from './file-storage-adapter.js';
import { LifecycleManager } from './lifecycle.js';
import { createChildLogger, logger } from './logger.js';
import {
  createPeerManager,
  type ICECandidate,
  type PeerManager,
  type SDPDescription,
} from './peer-manager.js';
import { formatPlanFeedbackForClaudeCode, serializePlanEditorDoc } from './plan-editor/index.js';
import { createPtyManager, type PtyManager } from './pty-manager.js';
import {
  SessionManager,
  type SessionResult,
  type StatusChangeCallback,
} from './session-manager.js';
import type { DaemonSignaling } from './signaling.js';
import { createSignalingHandle } from './signaling-setup.js';
import { cleanupStaleSetupEntries } from './worktree-cleanup.js';
import { createWorktree } from './worktree-command.js';

function assertNever(x: never): never {
  throw new Error(`Unhandled message type: ${JSON.stringify(x)}`);
}

/**
 * Deduplicates requests arriving via both ephemeral subscriptions and WebSocket relay.
 * Cleaned up in finally blocks when operations complete.
 */
const processedRequestIds = new Set<string>();

/** Tracks ephemeral cleanup timers so they can be cancelled during shutdown. */
const pendingCleanupTimers = new Set<ReturnType<typeof setTimeout>>();

function scheduleEphemeralCleanup(fn: () => void, delayMs: number): void {
  const timer = setTimeout(() => {
    pendingCleanupTimers.delete(timer);
    fn();
  }, delayMs);
  pendingCleanupTimers.add(timer);
}

interface TerminalDataChannel {
  send(data: string): void;
  close(): void;
  readyState?: string;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onclose: (() => void) | null;
}

const CONTROL_PREFIX = '\x00\x01\x00';
const TERMINAL_BUFFER_MAX_BYTES = 1_048_576;
const TERMINAL_OPEN_TIMEOUT_MS = 10_000;
const TERMINAL_CWD_TIMEOUT_MS = 5_000;

/**
 * Determine the best cwd for a new terminal session by checking the most
 * recently active task's cwd. Falls back to process.cwd().
 */
function resolveTerminalCwd(
  activeTasks: Map<string, ActiveTask>,
  watchedTasks: Map<string, () => void>,
  repo: Repo
): string {
  for (const taskId of activeTasks.keys()) {
    const epoch = DEFAULT_EPOCH;
    const taskDocId = buildDocumentId('task', taskId, epoch);
    try {
      const handle = repo.get(taskDocId, TaskDocumentSchema);
      const json = handle.doc.toJSON();
      const lastUserMsg = [...json.conversation].reverse().find((m) => m.role === 'user');
      if (lastUserMsg?.cwd) return lastUserMsg.cwd;
    } catch {}
  }

  for (const taskId of watchedTasks.keys()) {
    if (activeTasks.has(taskId)) continue;
    const epoch = DEFAULT_EPOCH;
    const taskDocId = buildDocumentId('task', taskId, epoch);
    try {
      const handle = repo.get(taskDocId, TaskDocumentSchema);
      const json = handle.doc.toJSON();
      const lastUserMsg = [...json.conversation].reverse().find((m) => m.role === 'user');
      if (lastUserMsg?.cwd) return lastUserMsg.cwd;
    } catch {}
  }

  return process.cwd();
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
  sessionManager: SessionManager;
  lastDispatchedConvLen: number;
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

  if (env.SHIPYARD_USER_TOKEN && env.SHIPYARD_SIGNALING_URL) {
    const client = new SignalingClient(env.SHIPYARD_SIGNALING_URL);
    try {
      const result = await client.verify(env.SHIPYARD_USER_TOKEN);
      if (!result.valid) {
        logger.error(
          `Auth token is no longer valid (${result.reason}). Run \`shipyard login\` to re-authenticate.`
        );
        process.exit(1);
      }
      log.info('Token verified against session server');
    } catch {
      log.warn('Could not verify token with session server, proceeding anyway');
    }
  }

  const lifecycle = new LifecycleManager();
  await lifecycle.acquirePidFile(getShipyardHome());

  const handle = await createSignalingHandle(env, log);
  if (!handle) {
    logger.error('SHIPYARD_SIGNALING_URL is required for serve mode');
    process.exit(1);
  }

  const { signaling, connection, capabilities } = handle;
  const activeTasks = new Map<string, ActiveTask>();
  const watchedTasks = new Map<string, () => void>();
  const taskHandles = new Map<string, TaskHandle>();

  const devSuffix = env.SHIPYARD_DEV ? '-dev' : '';
  const machineId = env.SHIPYARD_MACHINE_ID ?? `${hostname()}${devSuffix}`;

  const dataDir = resolve(env.SHIPYARD_DATA_DIR.replace('~', homedir()));
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const storage = new FileStorageAdapter(dataDir);
  const webrtcAdapter = new WebRtcDataChannelAdapter();
  const repo = new Repo({
    identity: { name: 'shipyard-daemon' },
    adapters: [storage, webrtcAdapter],
  });

  const terminalPtys = new Map<string, PtyManager>();

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
    onTerminalChannel(fromMachineId, rawChannel) {
      // eslint-disable-next-line no-restricted-syntax -- node-datachannel channel type is opaque
      const channel = rawChannel as TerminalDataChannel;
      const termLog = createChildLogger({ mode: `terminal:${fromMachineId}` });

      const existingPty = terminalPtys.get(fromMachineId);
      if (existingPty) {
        termLog.info('Disposing existing PTY for reconnecting machine');
        existingPty.dispose();
        terminalPtys.delete(fromMachineId);
      }

      const ptyManager = createPtyManager();
      terminalPtys.set(fromMachineId, ptyManager);
      let ptySpawned = false;

      /**
       * Buffer PTY output until the data channel is fully open.
       *
       * node-datachannel fires ondatachannel when the remote-created channel
       * arrives, but the channel may still be in "connecting" state. Calling
       * send() before it transitions to "open" throws InvalidStateError,
       * which silently drops the shell prompt and any early output -- resulting
       * in a blank xterm.js screen on the browser side.
       */
      let channelOpen = channel.readyState === 'open';
      const pendingBuffer: string[] = [];
      let pendingBufferBytes = 0;

      /** Buffer user input that arrives before the PTY is spawned. */
      const preSpawnInputBuffer: string[] = [];

      function disposeAndClose(reason: string): void {
        termLog.warn({ reason }, 'Disposing terminal');
        clearTimeout(openTimeout);
        clearTimeout(cwdTimeout);
        ptyManager.dispose();
        terminalPtys.delete(fromMachineId);
        if (channel.readyState === 'open') {
          channel.close();
        }
      }

      function flushPendingBuffer(): void {
        for (const chunk of pendingBuffer) {
          try {
            channel.send(chunk);
          } catch {}
        }
        pendingBuffer.length = 0;
        pendingBufferBytes = 0;
      }

      function sendOrBuffer(data: string): void {
        if (channelOpen) {
          try {
            channel.send(data);
          } catch {}
        } else {
          const byteLen = Buffer.byteLength(data);
          if (pendingBufferBytes + byteLen > TERMINAL_BUFFER_MAX_BYTES) {
            disposeAndClose('Pending buffer exceeded max size');
            return;
          }
          pendingBuffer.push(data);
          pendingBufferBytes += byteLen;
        }
      }

      /** Timeout: if channel never opens, clean up. */
      const openTimeout = setTimeout(() => {
        if (!channelOpen) {
          disposeAndClose('Data channel did not open within timeout');
        }
      }, TERMINAL_OPEN_TIMEOUT_MS);

      // eslint-disable-next-line no-restricted-syntax -- node-datachannel polyfill RTCDataChannel extends EventTarget
      const dcAsEventTarget = rawChannel as unknown as EventTarget;
      dcAsEventTarget.addEventListener('open', () => {
        termLog.info('Terminal data channel now open, flushing buffered output');
        channelOpen = true;
        clearTimeout(openTimeout);
        flushPendingBuffer();
      });

      /**
       * Spawn the PTY with the given cwd, wire up data/exit handlers,
       * and flush any pre-spawn user input.
       */
      function spawnPty(cwd: string): void {
        if (ptySpawned) return;
        ptySpawned = true;
        clearTimeout(cwdTimeout);

        try {
          ptyManager.spawn({ cwd });
        } catch (err: unknown) {
          termLog.error({ err }, 'Failed to spawn terminal PTY');
          channel.close();
          terminalPtys.delete(fromMachineId);
          return;
        }

        ptyManager.onData((data) => {
          sendOrBuffer(data);
        });

        ptyManager.onExit((exitCode, signal) => {
          termLog.info({ exitCode, signal }, 'Terminal PTY exited');
          if (channel.readyState === 'open') {
            channel.close();
          }
          terminalPtys.delete(fromMachineId);
        });

        for (const input of preSpawnInputBuffer) {
          try {
            ptyManager.write(input);
          } catch {}
        }
        preSpawnInputBuffer.length = 0;

        termLog.info(
          { cwd, pid: ptyManager.pid, channelReady: channelOpen },
          'Terminal PTY wired to data channel'
        );
      }

      /** Timeout: if no cwd message arrives, fall back to heuristic. */
      const cwdTimeout = setTimeout(() => {
        if (!ptySpawned) {
          termLog.info('No cwd control message received, falling back to heuristic');
          const fallbackCwd = resolveTerminalCwd(activeTasks, watchedTasks, repo);
          spawnPty(fallbackCwd);
        }
      }, TERMINAL_CWD_TIMEOUT_MS);

      function handleControlMessage(payload: string): void {
        try {
          // eslint-disable-next-line no-restricted-syntax -- JSON.parse returns unknown; fields validated on next lines
          const ctrl = JSON.parse(payload) as {
            type: string;
            cols?: number;
            rows?: number;
            path?: string;
          };
          if (ctrl.type === 'cwd' && typeof ctrl.path === 'string') {
            spawnPty(ctrl.path);
          } else if (
            ctrl.type === 'resize' &&
            typeof ctrl.cols === 'number' &&
            typeof ctrl.rows === 'number' &&
            ptySpawned
          ) {
            ptyManager.resize(ctrl.cols, ctrl.rows);
          }
        } catch {
          termLog.warn('Invalid control message received');
        }
      }

      function handleDataInput(raw: string): void {
        if (!ptySpawned) {
          preSpawnInputBuffer.push(raw);
          return;
        }
        try {
          ptyManager.write(raw);
        } catch {}
      }

      channel.onmessage = (event) => {
        const raw =
          typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        if (raw.startsWith(CONTROL_PREFIX)) {
          handleControlMessage(raw.slice(CONTROL_PREFIX.length));
        } else {
          handleDataInput(raw);
        }
      };

      channel.onclose = () => {
        termLog.info('Terminal data channel closed');
        channelOpen = false;
        clearTimeout(openTimeout);
        clearTimeout(cwdTimeout);
        ptyManager.dispose();
        terminalPtys.delete(fromMachineId);
      };
    },
  });

  /**
   * Write machine capabilities to the room document's ephemeral namespace.
   * The browser reads these to populate model/environment/permission pickers.
   * Keyed by machineId so each machine's capabilities are addressable.
   */
  const roomDocId = buildDocumentId('room', LOCAL_USER_ID, DEFAULT_EPOCH);
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const roomHandle = repo.get(
    roomDocId,
    TaskIndexDocumentSchema as never,
    ROOM_EPHEMERAL_DECLARATIONS
  );

  function publishCapabilities(caps: typeof capabilities): void {
    const value: MachineCapabilitiesEphemeralValue = {
      models: caps.models.map((m) => ({
        ...m,
        reasoning: m.reasoning ?? null,
      })),
      environments: caps.environments.map((e) => ({
        ...e,
        remote: e.remote ?? null,
      })),
      permissionModes: caps.permissionModes,
      homeDir: caps.homeDir ?? null,
    };
    roomHandle.capabilities.set(machineId, value);
    log.info({ machineId }, 'Published capabilities to room ephemeral');
  }

  publishCapabilities(capabilities);

  const branchWatcher = createBranchWatcher({
    environments: capabilities.environments,
    onUpdate: (updatedEnvs) => {
      capabilities.environments = updatedEnvs;
      publishCapabilities(capabilities);
    },
  });

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast for ephemeral access
  const typedRoomHandle = roomHandle as HandleWithEphemerals<
    TaskIndexDocumentShape,
    typeof ROOM_EPHEMERAL_DECLARATIONS
  >;

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generic erasure requires cast from TypedDoc<never> to concrete shape
  const typedRoomDoc = roomHandle.doc as TypedDoc<TaskIndexDocumentShape>;

  /** Clean up stale and orphaned worktree setup entries */
  cleanupStaleSetupEntries(typedRoomDoc, machineId, log);

  typedRoomHandle.enhancePromptReqs.subscribe(({ key: requestId, value, source }) => {
    if (source !== 'remote') return;
    if (!value) return;
    if (value.machineId !== machineId) return;
    if (processedRequestIds.has(requestId)) return;
    processedRequestIds.add(requestId);

    const enhLog = createChildLogger({ mode: `enhance-prompt-ephemeral:${requestId}` });
    enhLog.info(
      { promptLen: value.prompt.length },
      'Received enhance-prompt request via ephemeral'
    );

    if (!env.ANTHROPIC_API_KEY) {
      enhLog.error('ANTHROPIC_API_KEY is required for prompt enhancement');
      typedRoomHandle.enhancePromptResps.set(requestId, {
        status: 'error',
        text: '',
        error: 'ANTHROPIC_API_KEY not configured on daemon',
      });
      scheduleEphemeralCleanup(() => {
        typedRoomHandle.enhancePromptReqs.delete(requestId);
        typedRoomHandle.enhancePromptResps.delete(requestId);
      }, EPHEMERAL_CLEANUP_DELAY_MS);
      processedRequestIds.delete(requestId);
      return;
    }

    const abortController = lifecycle.createAbortController();
    const timeout = setTimeout(() => abortController.abort(), ENHANCE_PROMPT_TIMEOUT_MS);

    runEnhancePromptEphemeral(
      value.prompt,
      requestId,
      abortController,
      typedRoomHandle,
      enhLog
    ).finally(() => {
      clearTimeout(timeout);
      abortController.abort();
      processedRequestIds.delete(requestId);
    });
  });

  typedRoomHandle.worktreeCreateReqs.subscribe(({ key: requestId, value, source }) => {
    if (source !== 'remote') return;
    if (!value) return;
    if (value.machineId !== machineId) return;
    if (processedRequestIds.has(requestId)) return;
    processedRequestIds.add(requestId);

    const wtLog = createChildLogger({ mode: `worktree-create-ephemeral:${requestId}` });
    wtLog.info(
      {
        sourceRepoPath: value.sourceRepoPath,
        branchName: value.branchName,
        baseRef: value.baseRef,
      },
      'Received worktree-create request via ephemeral'
    );

    /** Prefer the request's setupScript; fall back to the persistent CRDT document */
    const roomJson = typedRoomDoc.toJSON();
    const crdtScriptEntry = roomJson?.userSettings?.worktreeScripts?.[value.sourceRepoPath];
    const resolvedSetupScript = value.setupScript ?? crdtScriptEntry?.script ?? null;

    runWorktreeCreateEphemeral(
      requestId,
      value.sourceRepoPath,
      value.branchName,
      value.baseRef,
      resolvedSetupScript,
      typedRoomHandle,
      typedRoomDoc,
      machineId,
      capabilities,
      publishCapabilities,
      branchWatcher,
      wtLog
    )
      .catch((err) => {
        wtLog.error({ err }, 'Worktree create ephemeral handler failed');
      })
      .finally(() => {
        processedRequestIds.delete(requestId);
      });
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
      roomDoc: typedRoomDoc,
      roomHandle: typedRoomHandle,
      lifecycle,
      activeTasks,
      watchedTasks,
      taskHandles,
      peerManager,
      env,
      machineId,
      capabilities,
      publishCapabilities,
      branchWatcher,
    });
  });

  connection.connect();

  log.info('Daemon running in serve mode, waiting for tasks...');

  lifecycle.onShutdown(async () => {
    log.info('Shutting down serve mode...');

    branchWatcher.close();

    for (const task of activeTasks.values()) {
      task.sessionManager.closeSession();
      task.abortController.abort();
    }
    activeTasks.clear();
    for (const timer of diffDebounceTimers.values()) {
      clearTimeout(timer);
    }
    diffDebounceTimers.clear();
    for (const timer of branchDiffTimers.values()) {
      clearTimeout(timer);
    }
    branchDiffTimers.clear();
    for (const unsub of watchedTasks.values()) {
      unsub();
    }
    watchedTasks.clear();
    taskHandles.clear();

    for (const timer of pendingCleanupTimers) clearTimeout(timer);
    pendingCleanupTimers.clear();

    for (const [id, ptyMgr] of terminalPtys) {
      ptyMgr.dispose();
      terminalPtys.delete(id);
    }

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
  roomDoc: TypedDoc<TaskIndexDocumentShape>;
  roomHandle: HandleWithEphemerals<TaskIndexDocumentShape, typeof ROOM_EPHEMERAL_DECLARATIONS>;
  lifecycle: LifecycleManager;
  activeTasks: Map<string, ActiveTask>;
  watchedTasks: Map<string, () => void>;
  taskHandles: Map<string, TaskHandle>;
  peerManager: PeerManager;
  env: Env;
  machineId: string;
  capabilities: MachineCapabilities;
  publishCapabilities: (caps: MachineCapabilities) => void;
  branchWatcher: BranchWatcher;
}

const DIFF_DEBOUNCE_MS = 2_000;
const BRANCH_DIFF_DEBOUNCE_MS = 10_000;
const diffDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const branchDiffTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedDiffCapture(
  taskId: string,
  cwd: string,
  taskHandle: TaskHandle,
  log: ReturnType<typeof createChildLogger>
): void {
  const existing = diffDebounceTimers.get(taskId);
  if (existing) clearTimeout(existing);

  diffDebounceTimers.set(
    taskId,
    setTimeout(() => {
      diffDebounceTimers.delete(taskId);
      captureDiffState(cwd, taskHandle, log).catch((err: unknown) => {
        log.warn({ err }, 'Failed to capture diff state');
      });
    }, DIFF_DEBOUNCE_MS)
  );
}

async function captureDiffState(
  cwd: string,
  taskHandle: TaskHandle,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  const [unstaged, staged, files] = await Promise.all([
    getUnstagedDiff(cwd),
    getStagedDiff(cwd),
    getChangedFiles(cwd),
  ]);
  change(taskHandle.doc, (draft) => {
    draft.diffState.unstaged = unstaged;
    draft.diffState.staged = staged;
    const fileList = draft.diffState.files;
    if (fileList.length > 0) {
      fileList.delete(0, fileList.length);
    }
    for (const file of files) {
      fileList.push(file);
    }
    draft.diffState.updatedAt = Date.now();
  });
  log.debug({ fileCount: files.length }, 'Diff state captured');
}

function debouncedBranchDiffCapture(
  taskId: string,
  cwd: string,
  taskHandle: TaskHandle,
  log: ReturnType<typeof createChildLogger>
): void {
  const existing = branchDiffTimers.get(taskId);
  if (existing) clearTimeout(existing);

  branchDiffTimers.set(
    taskId,
    setTimeout(() => {
      branchDiffTimers.delete(taskId);
      captureBranchDiffState(cwd, taskHandle, log).catch((err: unknown) => {
        log.warn({ err }, 'Failed to capture branch diff state');
      });
    }, BRANCH_DIFF_DEBOUNCE_MS)
  );
}

async function captureBranchDiffState(
  cwd: string,
  taskHandle: TaskHandle,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  const baseBranch = await getDefaultBranch(cwd);
  if (!baseBranch) {
    log.debug('No default branch found, skipping branch diff');
    return;
  }

  const [branchDiff, branchFiles] = await Promise.all([
    getBranchDiff(cwd, baseBranch),
    getBranchFiles(cwd, baseBranch),
  ]);

  change(taskHandle.doc, (draft) => {
    draft.diffState.branchDiff = branchDiff;
    draft.diffState.branchBase = baseBranch;
    const fileList = draft.diffState.branchFiles;
    if (fileList.length > 0) {
      fileList.delete(0, fileList.length);
    }
    for (const file of branchFiles) {
      fileList.push(file);
    }
    draft.diffState.branchUpdatedAt = Date.now();
  });
  log.debug({ baseBranch, fileCount: branchFiles.length }, 'Branch diff state captured');
}

async function captureTurnDiff(
  cwd: string,
  turnStartRef: string | null,
  taskHandle: TaskHandle,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  const turnEndRef = await captureTreeSnapshot(cwd);
  if (!turnStartRef || !turnEndRef) {
    log.debug('No turn diff to capture (refs missing)');
    return;
  }

  let turnDiff = '';
  let turnFiles: Array<{ path: string; status: string }> = [];

  if (turnStartRef !== turnEndRef) {
    [turnDiff, turnFiles] = await Promise.all([
      getSnapshotDiff(cwd, turnStartRef, turnEndRef),
      getSnapshotFiles(cwd, turnStartRef, turnEndRef),
    ]);
  }

  if (!turnDiff && turnFiles.length === 0) {
    [turnDiff, turnFiles] = await Promise.all([getUnstagedDiff(cwd), getChangedFiles(cwd)]);
  }

  if (!turnDiff && turnFiles.length === 0) {
    log.debug('No turn diff to capture (no changes)');
    return;
  }

  change(taskHandle.doc, (draft) => {
    draft.diffState.lastTurnDiff = turnDiff;
    const fileList = draft.diffState.lastTurnFiles;
    if (fileList.length > 0) {
      fileList.delete(0, fileList.length);
    }
    for (const file of turnFiles) {
      fileList.push(file);
    }
    draft.diffState.lastTurnUpdatedAt = Date.now();
  });
  log.debug({ fromRef: turnStartRef, toRef: turnEndRef }, 'Turn diff captured');
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
      ctx.peerManager
        // eslint-disable-next-line no-restricted-syntax -- WebRTC payloads are opaque (z.unknown) bridged to node-datachannel API
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

    case 'enhance-prompt-request':
      handleEnhancePrompt(msg, ctx);
      break;

    case 'enhance-prompt-chunk':
    case 'enhance-prompt-done':
      ctx.log.debug({ type: msg.type }, 'Enhance prompt echo');
      break;

    case 'worktree-create-request':
      handleWorktreeCreate(msg, ctx);
      break;

    case 'worktree-create-progress':
    case 'worktree-create-done':
    case 'worktree-create-error':
      ctx.log.debug({ type: msg.type }, 'Worktree create echo');
      break;

    case 'authenticated':
    case 'agent-joined':
    case 'agent-left':
    case 'agent-status-changed':
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
    taskLog.debug('Task already watched, re-checking for new work');
    ctx.connection.send({
      type: 'task-ack',
      requestId,
      taskId,
      accepted: true,
    });
    const taskHandle = ctx.taskHandles.get(taskId);
    if (taskHandle) {
      onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
    }
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

const ENHANCE_PROMPT_TIMEOUT_MS = 30_000;

const ENHANCE_SYSTEM_PROMPT = `You are a prompt rewriter that transforms rough user requests into clear, specific instructions for an AI coding assistant (Claude Code). The enhanced prompt will be sent AS the user's message to that assistant.

RULES:
- Write in imperative/request form ("Build...", "Create...", "Add...") — NEVER first person ("I'll...", "Let me...")
- Return ONLY the rewritten prompt. No preamble, explanation, or markdown formatting.
- Keep the user's core intent intact. Do not add features they didn't imply.
- Expand vague ideas into concrete specifics: name technologies, list features, set constraints.
- If the user names a technology, keep it. If they don't, pick sensible defaults.
- Target 2-5x the input length. Be concise and direct — no filler, hype, or superlatives.
- Do NOT add project setup boilerplate (e.g., "initialize a git repo", "set up CI/CD") unless asked.
- Structure as a single paragraph or short bullet list, whichever is clearer.

WHAT TO ADD:
- Specific features the request implies but doesn't list
- Technology choices when unspecified (framework, API, library)
- Concrete parameters (sizes, ranges, counts) instead of vague adjectives
- UI/UX details when building something visual
- Scope boundaries to prevent over-building

EXAMPLES:

Input: "make a cool hello world beat app"
Output: "Build a browser-based beat maker with a 4x4 pad grid that plays drum sounds on click. Include kick, snare, hi-hat, and clap samples using the Web Audio API. Add a step sequencer with play/pause, a tempo slider (60-200 BPM), and visual feedback on active pads. Keep it to a single page with a dark theme."

Input: "fix the login bug"
Output: "Investigate and fix the login bug. Check the authentication flow for common issues: expired tokens, incorrect credential validation, session handling errors, or CORS misconfigurations. Add error logging if missing and verify the fix works for both valid and invalid credential cases."

Input: "add dark mode"
Output: "Add a dark mode toggle to the app. Use CSS custom properties for theme colors, persist the user's preference in localStorage, and respect the system prefers-color-scheme setting as the default. Ensure all existing components have adequate contrast in both themes."

Input: "make a landing page for my saas"
Output: "Build a responsive landing page with: hero section with headline, subheadline, and CTA button; features grid (3-4 cards with icons); pricing section with 2-3 tier cards; FAQ accordion; and a footer with links. Use a clean, modern design with consistent spacing. Make it mobile-first with a sticky header."`;

function handleEnhancePrompt(
  msg: Extract<PersonalRoomServerMessage, { type: 'enhance-prompt-request' }>,
  ctx: MessageHandlerContext
): void {
  const { requestId, prompt } = msg;
  if (processedRequestIds.has(requestId)) return;
  processedRequestIds.add(requestId);

  const enhanceLog = createChildLogger({ mode: 'enhance-prompt' });

  if (!ctx.env.ANTHROPIC_API_KEY) {
    enhanceLog.error('ANTHROPIC_API_KEY is required for prompt enhancement');
    ctx.connection.send({
      type: 'error',
      code: 'missing_api_key',
      message: 'ANTHROPIC_API_KEY not configured on daemon',
      requestId,
    });
    processedRequestIds.delete(requestId);
    return;
  }

  const abortController = ctx.lifecycle.createAbortController();
  const timeout = setTimeout(() => abortController.abort(), ENHANCE_PROMPT_TIMEOUT_MS);

  runEnhancePrompt(prompt, requestId, abortController, ctx, enhanceLog).finally(() => {
    clearTimeout(timeout);
    abortController.abort();
    processedRequestIds.delete(requestId);
  });
}

function extractTextChunks(rawContent: unknown): string[] {
  if (!Array.isArray(rawContent)) return [];
  const chunks: string[] = [];
  for (const block of rawContent) {
    // eslint-disable-next-line no-restricted-syntax -- SDK content blocks typed as unknown[]
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      chunks.push(b.text);
    }
  }
  return chunks;
}

async function runEnhancePrompt(
  prompt: string,
  requestId: string,
  abortController: AbortController,
  ctx: MessageHandlerContext,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  let fullText = '';

  try {
    const response = query({
      prompt,
      options: {
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: ENHANCE_SYSTEM_PROMPT,
        abortController,
      },
    });

    for await (const message of response) {
      if (message.type !== 'assistant') continue;

      for (const text of extractTextChunks(message.message.content)) {
        fullText += text;
        ctx.connection.send({
          type: 'enhance-prompt-chunk',
          requestId,
          text,
        });
      }
    }

    ctx.connection.send({
      type: 'enhance-prompt-done',
      requestId,
      fullText,
    });

    log.info({ promptLen: prompt.length, resultLen: fullText.length }, 'Prompt enhanced');
  } catch (err: unknown) {
    if (abortController.signal.aborted) {
      log.warn('Prompt enhancement aborted');
    } else {
      log.error({ err }, 'Prompt enhancement failed');
    }

    ctx.connection.send({
      type: 'error',
      code: 'enhance_failed',
      message: err instanceof Error ? err.message : 'Prompt enhancement failed',
      requestId,
    });
  }
}

/**
 * Handle a worktree-create-request message from the browser.
 * Calls createWorktree() with progress callbacks relayed to the browser,
 * re-detects environments on success, and sends done or error.
 */
function handleWorktreeCreate(
  msg: Extract<PersonalRoomServerMessage, { type: 'worktree-create-request' }>,
  ctx: MessageHandlerContext
): void {
  const { requestId, sourceRepoPath, branchName, baseRef } = msg;
  if (processedRequestIds.has(requestId)) return;
  processedRequestIds.add(requestId);

  const wtLog = createChildLogger({ mode: 'worktree-create' });

  /** WebSocket path: read setup script from persistent CRDT document */
  const roomJson = ctx.roomDoc.toJSON();
  const scriptEntry = roomJson?.userSettings?.worktreeScripts?.[sourceRepoPath];
  const setupScript = scriptEntry?.script ?? null;

  wtLog.info({ sourceRepoPath, branchName, baseRef }, 'Starting worktree creation');

  runWorktreeCreate(requestId, sourceRepoPath, branchName, baseRef, setupScript, ctx, wtLog);
}

/**
 * Monitor a setup script child process and write results on exit.
 *
 * When the child exits, writes the terminal status to the CRDT document
 * (persistent, survives restarts) and publishes the result to the
 * worktreeSetupResps ephemeral namespace (instant browser notification).
 */
function monitorSetupChild(
  child: import('node:child_process').ChildProcess,
  requestId: string,
  worktreePath: string,
  machineId: string,
  roomHandle: RoomHandleWithEphemerals,
  roomDoc: TypedDoc<TaskIndexDocumentShape>,
  startedAt: number,
  log: ReturnType<typeof createChildLogger>
): void {
  child.on('exit', (exitCode, signal) => {
    const status = exitCode === 0 ? 'done' : 'failed';
    log.info({ worktreePath, exitCode, signal, status }, 'Setup script exited');

    /** Write terminal status to CRDT (persistent, survives daemon restarts) */
    change(roomDoc, (draft) => {
      draft.worktreeSetupStatus.set(worktreePath, {
        status,
        machineId,
        startedAt,
        completedAt: Date.now(),
        exitCode: exitCode ?? null,
        signal: signal ?? null,
        pid: child.pid ?? null,
      });
    });

    /** Publish result to ephemeral namespace for instant browser reactivity */
    try {
      roomHandle.worktreeSetupResps.set(requestId, {
        exitCode: exitCode ?? null,
        signal: signal ?? null,
        worktreePath,
      });
    } catch (err: unknown) {
      log.warn({ err }, 'Failed to publish setup result to ephemeral');
    }

    scheduleEphemeralCleanup(() => {
      roomHandle.worktreeSetupResps.delete(requestId);
    }, EPHEMERAL_CLEANUP_DELAY_MS);
  });

  child.on('error', (err) => {
    log.warn({ err: err.message }, 'Setup script spawn error');

    change(roomDoc, (draft) => {
      draft.worktreeSetupStatus.set(worktreePath, {
        status: 'failed',
        machineId,
        startedAt,
        completedAt: Date.now(),
        exitCode: null,
        signal: null,
        pid: child.pid ?? null,
      });
    });

    roomHandle.worktreeSetupResps.set(requestId, {
      exitCode: null,
      signal: null,
      worktreePath,
    });

    scheduleEphemeralCleanup(() => {
      roomHandle.worktreeSetupResps.delete(requestId);
    }, EPHEMERAL_CLEANUP_DELAY_MS);
  });

  /** Allow the daemon process to exit even if this child is still running */
  child.unref();
}

async function runWorktreeCreate(
  requestId: string,
  sourceRepoPath: string,
  branchName: string,
  baseRef: string,
  setupScript: string | null,
  ctx: MessageHandlerContext,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  try {
    const result = await createWorktree({
      sourceRepoPath,
      branchName,
      baseRef,
      setupScript,
      onProgress(step, detail) {
        ctx.connection.send({
          type: 'worktree-create-progress',
          requestId,
          // eslint-disable-next-line no-restricted-syntax -- step string from createWorktree matches the schema enum
          step: step as
            | 'creating-worktree'
            | 'copying-files'
            | 'running-setup-script'
            | 'refreshing-environments'
            | 'done',
          detail,
        });
      },
    });

    ctx.connection.send({
      type: 'worktree-create-progress',
      requestId,
      step: 'refreshing-environments',
      detail: 'Re-detecting git environments',
    });

    try {
      const newEnvs = await detectEnvironments();
      ctx.capabilities.environments = newEnvs;
      ctx.publishCapabilities(ctx.capabilities);

      const repoMeta = await getRepoMetadata(result.worktreePath);
      if (repoMeta) {
        ctx.branchWatcher.addEnvironment(result.worktreePath, repoMeta.branch);
      }
    } catch (err: unknown) {
      log.warn({ err }, 'Failed to refresh environments after worktree creation');
    }

    ctx.connection.send({
      type: 'worktree-create-done',
      requestId,
      worktreePath: result.worktreePath,
      branchName: result.branchName,
      setupScriptStarted: result.setupScriptStarted,
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
    });

    if (result.setupChild) {
      const startedAt = Date.now();
      change(ctx.roomDoc, (draft) => {
        draft.worktreeSetupStatus.set(result.worktreePath, {
          status: 'running',
          machineId: ctx.machineId,
          startedAt,
          completedAt: null,
          exitCode: null,
          signal: null,
          pid: result.setupChild?.pid ?? null,
        });
      });

      monitorSetupChild(
        result.setupChild,
        requestId,
        result.worktreePath,
        ctx.machineId,
        ctx.roomHandle,
        ctx.roomDoc,
        startedAt,
        log
      );
    }

    log.info(
      {
        worktreePath: result.worktreePath,
        setupScriptStarted: result.setupScriptStarted,
        warningCount: result.warnings.length,
      },
      'Worktree created successfully'
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, 'Worktree creation failed');

    ctx.connection.send({
      type: 'worktree-create-error',
      requestId,
      message,
    });
  } finally {
    processedRequestIds.delete(requestId);
  }
}

/**
 * Type alias for the room handle with all ephemeral namespaces.
 * Used by ephemeral request handlers that receive the handle directly
 * rather than through the MessageHandlerContext.
 */
type RoomHandleWithEphemerals = HandleWithEphemerals<
  TaskIndexDocumentShape,
  typeof ROOM_EPHEMERAL_DECLARATIONS
>;

const EPHEMERAL_CLEANUP_DELAY_MS = 5_000;

/**
 * Process an enhance-prompt request received via Loro ephemeral.
 * Streams accumulated text to the enhancePromptResps ephemeral namespace,
 * then cleans up both req and resp entries after a delay.
 */
async function runEnhancePromptEphemeral(
  prompt: string,
  requestId: string,
  abortController: AbortController,
  roomHandle: RoomHandleWithEphemerals,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  let fullText = '';

  try {
    const response = query({
      prompt,
      options: {
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: ENHANCE_SYSTEM_PROMPT,
        abortController,
      },
    });

    for await (const message of response) {
      if (message.type !== 'assistant') continue;

      for (const text of extractTextChunks(message.message.content)) {
        fullText += text;
        roomHandle.enhancePromptResps.set(requestId, {
          status: 'streaming',
          text: fullText,
          error: null,
        });
      }
    }

    roomHandle.enhancePromptResps.set(requestId, {
      status: 'done',
      text: fullText,
      error: null,
    });

    log.info(
      { promptLen: prompt.length, resultLen: fullText.length },
      'Prompt enhanced via ephemeral'
    );
  } catch (err: unknown) {
    if (abortController.signal.aborted) {
      log.warn('Prompt enhancement aborted (ephemeral)');
    } else {
      log.error({ err }, 'Prompt enhancement failed (ephemeral)');
    }

    const errorMessage = err instanceof Error ? err.message : 'Prompt enhancement failed';
    roomHandle.enhancePromptResps.set(requestId, {
      status: 'error',
      text: '',
      error: errorMessage,
    });
  } finally {
    scheduleEphemeralCleanup(() => {
      roomHandle.enhancePromptReqs.delete(requestId);
      roomHandle.enhancePromptResps.delete(requestId);
    }, EPHEMERAL_CLEANUP_DELAY_MS);
  }
}

/**
 * Process a worktree-create request received via Loro ephemeral.
 * Writes progress updates to worktreeCreateResps, then cleans up after a delay.
 */
async function runWorktreeCreateEphemeral(
  requestId: string,
  sourceRepoPath: string,
  branchName: string,
  baseRef: string,
  setupScript: string | null,
  roomHandle: RoomHandleWithEphemerals,
  roomDoc: TypedDoc<TaskIndexDocumentShape>,
  localMachineId: string,
  caps: MachineCapabilities,
  publishCaps: (caps: MachineCapabilities) => void,
  watcher: BranchWatcher,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  try {
    const result = await createWorktree({
      sourceRepoPath,
      branchName,
      baseRef,
      setupScript,
      onProgress(step, detail) {
        roomHandle.worktreeCreateResps.set(requestId, {
          // eslint-disable-next-line no-restricted-syntax -- step string from createWorktree matches the schema enum
          status: step as
            | 'creating-worktree'
            | 'copying-files'
            | 'running-setup-script'
            | 'refreshing-environments'
            | 'done',
          detail: detail ?? null,
          worktreePath: null,
          branchName: null,
          setupScriptStarted: null,
          warnings: null,
          error: null,
        });
      },
    });

    roomHandle.worktreeCreateResps.set(requestId, {
      status: 'refreshing-environments',
      detail: 'Re-detecting git environments',
      worktreePath: null,
      branchName: null,
      setupScriptStarted: null,
      warnings: null,
      error: null,
    });

    try {
      const newEnvs = await detectEnvironments();
      caps.environments = newEnvs;
      publishCaps(caps);

      const repoMeta = await getRepoMetadata(result.worktreePath);
      if (repoMeta) {
        watcher.addEnvironment(result.worktreePath, repoMeta.branch);
      }
    } catch (err: unknown) {
      log.warn({ err }, 'Failed to refresh environments after worktree creation (ephemeral)');
    }

    roomHandle.worktreeCreateResps.set(requestId, {
      status: 'done',
      detail: null,
      worktreePath: result.worktreePath,
      branchName: result.branchName,
      setupScriptStarted: result.setupScriptStarted,
      warnings: result.warnings.length > 0 ? result.warnings : null,
      error: null,
    });

    if (result.setupChild) {
      const startedAt = Date.now();
      change(roomDoc, (draft) => {
        draft.worktreeSetupStatus.set(result.worktreePath, {
          status: 'running',
          machineId: localMachineId,
          startedAt,
          completedAt: null,
          exitCode: null,
          signal: null,
          pid: result.setupChild?.pid ?? null,
        });
      });

      monitorSetupChild(
        result.setupChild,
        requestId,
        result.worktreePath,
        localMachineId,
        roomHandle,
        roomDoc,
        startedAt,
        log
      );
    }

    log.info(
      {
        worktreePath: result.worktreePath,
        setupScriptStarted: result.setupScriptStarted,
        warningCount: result.warnings.length,
      },
      'Worktree created successfully via ephemeral'
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, 'Worktree creation failed (ephemeral)');

    roomHandle.worktreeCreateResps.set(requestId, {
      status: 'error',
      detail: null,
      worktreePath: null,
      branchName: null,
      setupScriptStarted: null,
      warnings: null,
      error: message,
    });
  } finally {
    scheduleEphemeralCleanup(() => {
      roomHandle.worktreeCreateReqs.delete(requestId);
      roomHandle.worktreeCreateResps.delete(requestId);
    }, EPHEMERAL_CLEANUP_DELAY_MS);
  }
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
  const epoch = DEFAULT_EPOCH;
  const taskDocId = buildDocumentId('task', taskId, epoch);
  taskLog.info({ taskDocId, epoch }, 'Watching task document');

  const taskHandle = ctx.repo.get(taskDocId, TaskDocumentSchema, TaskEphemeralDeclarations);

  try {
    await taskHandle.waitForSync({ kind: 'storage', timeout: 5_000 });
  } catch {
    taskLog.debug({ taskDocId }, 'No existing task data in storage');
  }

  const json = taskHandle.doc.toJSON();
  const lastUserMsg = [...json.conversation].reverse().find((m) => m.role === 'user');
  const initialCwd = lastUserMsg?.cwd ?? process.cwd();
  captureBranchDiffState(initialCwd, taskHandle, taskLog).catch((err: unknown) => {
    taskLog.warn({ err }, 'Failed to capture initial branch diff');
  });

  const opCountBefore = taskHandle.loroDoc.opCount();
  taskLog.info({ taskDocId, opCount: opCountBefore }, 'Doc state before subscribe');

  const unsubscribe = taskHandle.subscribe((event) => {
    taskLog.info({ taskDocId, eventBy: event.by }, 'Subscription event received');
    onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
  });

  ctx.watchedTasks.set(taskId, unsubscribe);
  ctx.taskHandles.set(taskId, taskHandle);
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

function handleFollowUp(
  activeTask: ActiveTask | undefined,
  conversationLen: number,
  taskLog: ReturnType<typeof createChildLogger>
): void {
  if (!activeTask) return;
  if (conversationLen <= activeTask.lastDispatchedConvLen) {
    taskLog.debug(
      { conversationLen, lastDispatched: activeTask.lastDispatchedConvLen },
      'Conversation unchanged since last dispatch, skipping duplicate'
    );
    return;
  }
  if (!activeTask.sessionManager.isStreaming) {
    taskLog.debug('Task already running but not streaming, skipping');
    return;
  }
  const contentBlocks = activeTask.sessionManager.getLatestUserContentBlocks();
  if (contentBlocks && contentBlocks.length > 0) {
    try {
      taskLog.info('Sending follow-up to active streaming session');
      activeTask.lastDispatchedConvLen = conversationLen;
      activeTask.sessionManager.sendFollowUp(contentBlocks);
    } catch (err: unknown) {
      taskLog.warn({ err }, 'Failed to send follow-up to streaming session');
    }
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

  if (ctx.activeTasks.has(taskId)) {
    const conversation = json.conversation;
    const lastMessage = conversation[conversation.length - 1];
    if (lastMessage?.role === 'user') {
      handleFollowUp(ctx.activeTasks.get(taskId), conversation.length, taskLog);
    }

    const activeLastUserMsg = [...conversation].reverse().find((m) => m.role === 'user');
    const activeCwd = activeLastUserMsg?.cwd ?? process.cwd();
    debouncedDiffCapture(taskId, activeCwd, taskHandle, taskLog);
    debouncedBranchDiffCapture(taskId, activeCwd, taskHandle, taskLog);
    return;
  }

  if (
    json.meta.status === 'working' ||
    json.meta.status === 'input-required' ||
    json.meta.status === 'starting'
  ) {
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

  taskLog.info('New user message detected, starting agent');

  const cwd = lastMessage.cwd ?? process.cwd();
  const model = lastMessage.model ?? undefined;
  const permissionMode = mapPermissionMode(lastMessage.permissionMode);
  const effort = lastMessage.reasoningEffort ?? undefined;

  const abortController = ctx.lifecycle.createAbortController();

  const onStatusChange: StatusChangeCallback = (status) => {
    updateTaskInIndex(ctx.roomDoc, taskId, { status, updatedAt: Date.now() });
  };
  const manager = new SessionManager(doc, onStatusChange);

  const activeTask: ActiveTask = {
    taskId,
    abortController,
    sessionManager: manager,
    lastDispatchedConvLen: conversation.length,
  };
  ctx.activeTasks.set(taskId, activeTask);

  ctx.signaling.updateStatus('running', taskId);

  const turnStartRefPromise = captureTreeSnapshot(cwd);

  turnStartRefPromise
    .then((ref) => taskLog.debug({ turnStartRef: ref }, 'Captured turn start snapshot'))
    .catch((err: unknown) => taskLog.warn({ err }, 'Failed to capture turn start snapshot'));

  runTask({
    sessionManager: manager,
    taskHandle,
    taskId,
    roomDoc: ctx.roomDoc,
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
    .finally(() =>
      cleanupTaskRun({
        taskId,
        cwd,
        taskHandle,
        taskLog,
        turnStartRefPromise,
        abortController,
        ctx,
      })
    );
}

interface CleanupTaskRunOptions {
  taskId: string;
  cwd: string;
  taskHandle: TaskHandle;
  taskLog: ReturnType<typeof createChildLogger>;
  turnStartRefPromise: Promise<string | null>;
  abortController: AbortController;
  ctx: MessageHandlerContext;
}

async function cleanupTaskRun(opts: CleanupTaskRunOptions): Promise<void> {
  const { taskId, cwd, taskHandle, taskLog, turnStartRefPromise, abortController, ctx } = opts;

  const activeTask = ctx.activeTasks.get(taskId);
  activeTask?.sessionManager.closeSession();

  clearDebouncedTimer(diffDebounceTimers, taskId);
  clearDebouncedTimer(branchDiffTimers, taskId);

  try {
    await captureDiffState(cwd, taskHandle, taskLog);
  } catch (err: unknown) {
    taskLog.warn({ err }, 'Failed to capture final diff state');
  }

  try {
    await captureBranchDiffState(cwd, taskHandle, taskLog);
  } catch (err: unknown) {
    taskLog.warn({ err }, 'Failed to capture final branch diff state');
  }

  try {
    const turnStartRef = await turnStartRefPromise;
    await captureTurnDiff(cwd, turnStartRef, taskHandle, taskLog);
  } catch (err: unknown) {
    taskLog.warn({ err }, 'Failed to capture turn diff');
  }

  abortController.abort();

  for (const [key] of taskHandle.permReqs.getAll()) {
    taskHandle.permReqs.delete(key);
  }
  for (const [key] of taskHandle.permResps.getAll()) {
    taskHandle.permResps.delete(key);
  }

  ctx.activeTasks.delete(taskId);
  ctx.signaling.updateStatus('idle');
}

function clearDebouncedTimer(
  timers: Map<string, ReturnType<typeof setTimeout>>,
  taskId: string
): void {
  const timer = timers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(taskId);
  }
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
/**
 * Convert a browser permission response into the Agent SDK's PermissionResult.
 *
 * `updatedInput` is set to the original input as a defensive identity
 * pass-through. The SDK uses `updatedInput ?? originalInput` internally,
 * so this is a no-op. If input modification is ever needed (e.g., letting
 * the browser edit tool input before approval), this is where it would go.
 *
 * `updatedPermissions` forwards the SDK's suggestions so the SDK can apply
 * session-scoped permission rules (e.g., "allow Bash for this directory").
 */
function toPermissionResult(
  decision: PermissionDecision,
  input: Record<string, unknown>,
  suggestions: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[] | undefined,
  message: string | null
): PermissionResult {
  if (decision === 'approved') {
    return {
      behavior: 'allow',
      updatedInput: input,
      updatedPermissions: suggestions,
    };
  }
  return {
    behavior: 'deny',
    message: message ?? 'User denied permission',
  };
}

interface PermissionResponseContext {
  taskHandle: TaskHandle;
  roomDoc: TypedDoc<TaskIndexDocumentShape>;
  taskId: string;
  taskLog: ReturnType<typeof createChildLogger>;
  toolName: string;
  toolUseID: string;
  input: Record<string, unknown>;
  suggestions: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[] | undefined;
  value: { decision: string; persist: boolean; message: string | null };
}

/**
 * Handle ExitPlanMode permission response: read the edited editor doc,
 * gather unresolved comments, compute rich feedback, and update the plan
 * reviewStatus in the CRDT. Mutates `value.message` so the rich feedback
 * flows through to the SDK permission result.
 */
function resolveExitPlanMode(
  taskHandle: TaskHandle,
  taskLog: ReturnType<typeof createChildLogger>,
  toolUseID: string,
  value: { decision: string; persist: boolean; message: string | null }
): void {
  const plans = taskHandle.doc.toJSON().plans;
  const planIndex = plans.findIndex((p) => p.toolUseId === toolUseID);
  if (planIndex < 0) return;

  const plan = plans[planIndex];
  if (!plan) return;

  const reviewStatus = value.decision === 'approved' ? 'approved' : 'changes-requested';
  const editedMarkdown = serializePlanEditorDoc(taskHandle.loroDoc, plan.planId);

  const allComments = taskHandle.doc.toJSON().planComments;
  const planComments = Object.values(allComments).filter(
    (c) => c.planId === plan.planId && c.resolvedAt === null
  );

  const richFeedback = formatPlanFeedbackForClaudeCode(
    plan.markdown,
    editedMarkdown || plan.markdown,
    planComments,
    value.message ?? null
  );

  change(taskHandle.doc, (draft) => {
    const draftPlan = draft.plans.get(planIndex);
    if (draftPlan) {
      draftPlan.reviewStatus = reviewStatus;
      draftPlan.reviewFeedback = (richFeedback || value.message) ?? null;
    }
  });

  if (richFeedback) {
    value.message = richFeedback;
  }

  taskLog.info(
    {
      toolUseID,
      reviewStatus,
      hasFeedback: !!richFeedback,
      hasEdits: editedMarkdown !== plan.markdown,
    },
    'Updated plan reviewStatus in CRDT with rich feedback'
  );
}

/**
 * Process a browser permission response: clean up ephemeral entries,
 * update task status back to 'working', log the response, and return
 * the SDK-compatible PermissionResult.
 */
function resolvePermissionResponse(ctx: PermissionResponseContext): PermissionResult {
  const { taskHandle, roomDoc, taskId, taskLog, toolName, toolUseID, input, suggestions, value } =
    ctx;

  taskHandle.permReqs.delete(toolUseID);
  taskHandle.permResps.delete(toolUseID);

  change(taskHandle.doc, (draft) => {
    draft.meta.status = 'working';
    draft.meta.updatedAt = Date.now();
  });
  updateTaskInIndex(roomDoc, taskId, { status: 'working', updatedAt: Date.now() });

  if (toolName === 'ExitPlanMode') {
    resolveExitPlanMode(taskHandle, taskLog, toolUseID, value);
  }

  taskLog.info(
    {
      toolName,
      toolUseID,
      decision: value.decision,
      persist: value.persist,
      hasSuggestions: !!suggestions?.length,
    },
    'Permission response received'
  );

  const decision = value.decision === 'approved' ? 'approved' : 'denied';
  return toPermissionResult(decision, input, suggestions, value.message);
}

function buildCanUseTool(
  taskHandle: TaskHandle,
  taskLog: ReturnType<typeof createChildLogger>,
  roomDoc: TypedDoc<TaskIndexDocumentShape>,
  taskId: string
): CanUseTool {
  return async (toolName, input, options) => {
    const { signal, toolUseID, blockedPath, decisionReason, agentID, suggestions } = options;

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
    updateTaskInIndex(roomDoc, taskId, { status: 'input-required', updatedAt: Date.now() });

    taskLog.info(
      {
        toolName,
        toolUseID,
        riskLevel,
        decisionReason,
        blockedPath,
        hasSuggestions: !!suggestions?.length,
      },
      'Permission request sent to browser'
    );

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

        resolve(
          resolvePermissionResponse({
            taskHandle,
            roomDoc,
            taskId,
            taskLog,
            toolName,
            toolUseID,
            input,
            suggestions,
            value,
          })
        );
      });
    });
  };
}

interface RunTaskOptions {
  sessionManager: SessionManager;
  taskHandle: TaskHandle;
  taskId: string;
  roomDoc: TypedDoc<TaskIndexDocumentShape>;
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
    sessionManager: manager,
    taskHandle,
    taskId,
    roomDoc,
    cwd,
    model,
    permissionMode,
    effort,
    machineId,
    abortController,
    log,
  } = opts;

  const contentBlocks = manager.getLatestUserContentBlocks();
  if (!contentBlocks || contentBlocks.length === 0) {
    throw new Error(`No user message found in task ${taskId}`);
  }

  const textPreview = contentBlocks
    .filter((b): b is typeof b & { type: 'text' } => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .slice(0, 100);
  const imageCount = contentBlocks.filter((b) => b.type === 'image').length;
  log.info(
    { prompt: textPreview || '(images only)', imageCount },
    'Running task with prompt from CRDT'
  );

  const canUseTool =
    permissionMode === 'bypassPermissions'
      ? undefined
      : buildCanUseTool(taskHandle, log, roomDoc, taskId);

  const stderr = (data: string) => {
    const trimmed = data.trim();
    if (!trimmed) return;
    if (trimmed.includes('Error') || trimmed.includes('error')) {
      log.error({ stderr: trimmed }, 'SDK subprocess error');
    } else {
      log.debug({ stderr: trimmed }, 'SDK subprocess stderr');
    }
  };

  const resumeInfo = manager.shouldResume();
  if (resumeInfo.resume && resumeInfo.sessionId) {
    log.info({ sessionId: resumeInfo.sessionId }, 'Resuming existing session');
    return manager.resumeSession(resumeInfo.sessionId, contentBlocks, {
      abortController,
      machineId,
      model,
      permissionMode,
      effort,
      canUseTool,
      stderr,
      allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
    });
  }

  return manager.createSession({
    prompt: contentBlocks,
    cwd,
    machineId,
    model,
    permissionMode,
    effort,
    abortController,
    canUseTool,
    stderr,
    allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
  });
}
