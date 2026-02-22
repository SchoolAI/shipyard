import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';
import type { CanUseTool, PermissionMode, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import { change, type TypedDoc } from '@loro-extended/change';
import type { Handle, HandleWithEphemerals } from '@loro-extended/repo';
import { Repo } from '@loro-extended/repo';
import {
  buildDocumentId,
  buildShipyardPermissions,
  buildTaskConvDocId,
  buildTaskMetaDocId,
  buildTaskReviewDocId,
  classifyToolRisk,
  DEFAULT_EPOCH,
  LOCAL_USER_ID,
  type MachineCapabilitiesEphemeralValue,
  type PermissionDecision,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  type PlanComment,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskConversationDocumentSchema,
  type TaskConversationDocumentShape,
  type TaskDocHandles,
  TaskIndexDocumentSchema,
  type TaskIndexDocumentShape,
  TaskMetaDocumentSchema,
  type TaskMetaDocumentShape,
  TaskReviewDocumentSchema,
  type TaskReviewDocumentShape,
  TERMINAL_TASK_STATES,
  updateTaskInIndex,
} from '@shipyard/loro-schema';
import type { MachineCapabilities, PersonalRoomServerMessage } from '@shipyard/session';
import { SignalingClient } from '@shipyard/session/client';
import { type BranchWatcher, createBranchWatcher } from './branch-watcher.js';
import {
  captureTreeSnapshot,
  detectAnthropicAuth,
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
import { recoverOrphanedTask } from './crash-recovery.js';
import { shouldDispatchNewWork } from './dispatch-gate.js';
import type { Env } from './env.js';
import { getShipyardHome } from './env.js';
import { FileStorageAdapter } from './file-storage-adapter.js';
import { KeepAwakeManager } from './keep-awake.js';
import { LifecycleManager } from './lifecycle.js';
import { createChildLogger, logger } from './logger.js';
import {
  createPeerManager,
  type ICECandidate,
  type PeerManager,
  type SDPDescription,
} from './peer-manager.js';
import {
  formatDiffFeedbackForClaudeCode,
  formatPlanFeedbackForClaudeCode,
  serializePlanEditorDoc,
} from './plan-editor/index.js';
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
 * Ephemeral namespace declarations for task documents.
 * permReqs: daemon writes pending tool permission requests (browser reads)
 * permResps: browser writes permission decisions (daemon reads)
 */
const TaskEphemeralDeclarations = {
  permReqs: PermissionRequestEphemeral,
  permResps: PermissionResponseEphemeral,
};

type TaskConvHandle = HandleWithEphemerals<
  TaskConversationDocumentShape,
  typeof TaskEphemeralDeclarations
>;

interface TaskHandleGroup {
  meta: Handle<TaskMetaDocumentShape>;
  conv: TaskConvHandle;
  review: Handle<TaskReviewDocumentShape>;
}

interface ActiveTask {
  taskId: string;
  abortController: AbortController;
  sessionManager: SessionManager;
  lastDispatchedConvLen: number;
}

const TERMINAL_STATUSES = new Set(TERMINAL_TASK_STATES);

/**
 * Load all non-terminal task documents from storage so they are serveable
 * via WebRTC when the browser requests them. Without this, task documents
 * sit in LevelDB but are invisible to peers — the Loro repo requires an
 * explicit repo.get() to make a document discoverable.
 */
async function rehydrateTaskDocuments(
  roomHandle: ReturnType<Repo['get']>,
  roomDoc: TypedDoc<TaskIndexDocumentShape>,
  repo: Repo,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  try {
    await roomHandle.waitForSync({ kind: 'storage', timeout: 5_000 });
  } catch {
    log.warn(
      'Room doc storage sync timed out during rehydration — task rehydration may be incomplete'
    );
  }

  const roomJson = roomDoc.toJSON();
  const taskEntries = Object.entries(roomJson.taskIndex ?? {});

  log.info({ count: taskEntries.length }, 'Rehydrating task documents from storage');

  for (const [taskId, entry] of taskEntries) {
    if (TERMINAL_STATUSES.has(entry.status)) continue;

    try {
      const epoch = DEFAULT_EPOCH;
      const metaHandle = repo.get(buildTaskMetaDocId(taskId, epoch), TaskMetaDocumentSchema);
      const convHandle = repo.get(
        buildTaskConvDocId(taskId, epoch),
        TaskConversationDocumentSchema,
        TaskEphemeralDeclarations
      );
      const reviewHandle = repo.get(buildTaskReviewDocId(taskId, epoch), TaskReviewDocumentSchema);

      await Promise.all([
        metaHandle.waitForSync({ kind: 'storage', timeout: 5_000 }),
        convHandle.waitForSync({ kind: 'storage', timeout: 5_000 }),
      ]);

      const taskDocs: TaskDocHandles = {
        meta: metaHandle.doc,
        conv: convHandle.doc,
        review: reviewHandle.doc,
      };
      if (recoverOrphanedTask(taskDocs, createChildLogger({ mode: 'rehydrate', taskId }))) {
        updateTaskInIndex(roomDoc, taskId, { status: 'failed', updatedAt: Date.now() });
      }

      log.debug({ taskId }, 'Task documents rehydrated');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to rehydrate task documents');
    }
  }

  log.info('Task document rehydration complete');
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
  const taskHandles = new Map<string, TaskHandleGroup>();
  const lastProcessedConvLen = new Map<string, number>();

  const devSuffix = env.SHIPYARD_DEV ? '-dev' : '';
  const machineId = env.SHIPYARD_MACHINE_ID ?? `${hostname()}${devSuffix}`;

  const dataDir = resolve(env.SHIPYARD_DATA_DIR.replace('~', homedir()));
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const storage = new FileStorageAdapter(dataDir);
  const webrtcAdapter = new WebRtcDataChannelAdapter();
  const repo = new Repo({
    identity: { name: 'shipyard-daemon', type: 'service' },
    adapters: [storage, webrtcAdapter],
    permissions: buildShipyardPermissions('owner'),
  });

  const keepAwakeManager = new KeepAwakeManager(log);
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
    onTerminalChannel(fromMachineId, rawChannel, taskId) {
      // eslint-disable-next-line no-restricted-syntax -- node-datachannel channel type is opaque
      const channel = rawChannel as TerminalDataChannel;
      const terminalKey = `${fromMachineId}:${taskId}`;
      const termLog = createChildLogger({ mode: `terminal:${fromMachineId}:${taskId}` });

      const existingPty = terminalPtys.get(terminalKey);
      if (existingPty) {
        termLog.info('Disposing existing PTY for reconnecting machine');
        existingPty.dispose();
        terminalPtys.delete(terminalKey);
      }

      const ptyManager = createPtyManager();
      terminalPtys.set(terminalKey, ptyManager);
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
        terminalPtys.delete(terminalKey);
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
          terminalPtys.delete(terminalKey);
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
          terminalPtys.delete(terminalKey);
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

      /** Timeout: if no cwd message arrives, fall back to $HOME. */
      const cwdTimeout = setTimeout(() => {
        if (!ptySpawned) {
          termLog.info('No cwd control message received, falling back to $HOME');
          const fallbackCwd = process.env.HOME ?? process.cwd();
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

      // TODO: Add idle timeout for PTY cleanup. For now, PTYs live until the data channel closes.
      channel.onclose = () => {
        termLog.info('Terminal data channel closed');
        channelOpen = false;
        clearTimeout(openTimeout);
        clearTimeout(cwdTimeout);
        ptyManager.dispose();
        if (terminalPtys.get(terminalKey) === ptyManager) {
          terminalPtys.delete(terminalKey);
        }
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
      anthropicAuth: caps.anthropicAuth
        ? {
            status: caps.anthropicAuth.status,
            method: caps.anthropicAuth.method,
            email: caps.anthropicAuth.email ?? null,
          }
        : null,
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

  await rehydrateTaskDocuments(roomHandle, typedRoomDoc, repo, log);

  /** Track the keep-awake user setting and react to changes */
  let keepAwakeEnabled = typedRoomDoc.toJSON().userSettings?.keepMachineAwake ?? false;
  const keepAwakeUnsub = roomHandle.subscribe(() => {
    const newValue = typedRoomDoc.toJSON().userSettings?.keepMachineAwake ?? false;
    if (newValue !== keepAwakeEnabled) {
      keepAwakeEnabled = newValue;
      log.info({ keepAwakeEnabled }, 'Keep-awake setting changed');
      keepAwakeManager.update(keepAwakeEnabled, activeTasks.size > 0);
    }
  });

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

    if (capabilities.anthropicAuth?.status !== 'authenticated') {
      enhLog.error('Not authenticated with Anthropic');
      typedRoomHandle.enhancePromptResps.set(requestId, {
        status: 'error',
        text: '',
        error:
          "Not authenticated with Anthropic. Run 'claude auth login' or set ANTHROPIC_API_KEY.",
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

    runEnhancePromptEphemeral(value.prompt, requestId, abortController, typedRoomHandle, enhLog)
      .catch((err: unknown) => {
        enhLog.error({ err }, 'Enhance prompt ephemeral failed');
      })
      .finally(() => {
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

  typedRoomHandle.anthropicLoginReqs.subscribe(({ key: requestId, value, source }) => {
    if (source !== 'remote') return;
    if (!value) return;
    if (value.machineId !== machineId) return;
    if (processedRequestIds.has(requestId)) return;
    processedRequestIds.add(requestId);

    const loginLog = createChildLogger({ mode: `anthropic-login:${requestId}` });
    loginLog.info('Received Anthropic login request via ephemeral');

    typedRoomHandle.anthropicLoginResps.set(requestId, {
      status: 'starting',
      loginUrl: null,
      error: null,
    });

    const child = spawn('claude', ['auth', 'login'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;

      const urlMatch = text.match(/https:\/\/\S+/);
      if (urlMatch) {
        typedRoomHandle.anthropicLoginResps.set(requestId, {
          status: 'waiting',
          loginUrl: urlMatch[0],
          error: null,
        });
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;

      const urlMatch = text.match(/https:\/\/\S+/);
      if (urlMatch) {
        typedRoomHandle.anthropicLoginResps.set(requestId, {
          status: 'waiting',
          loginUrl: urlMatch[0],
          error: null,
        });
      }
    });

    child.on('exit', (exitCode) => {
      if (exitCode === 0) {
        loginLog.info('Anthropic login completed successfully');

        detectAnthropicAuth()
          .then((authStatus) => {
            capabilities.anthropicAuth = authStatus;
            publishCapabilities(capabilities);
            loginLog.info({ authStatus }, 'Re-detected auth after login');
          })
          .catch((err: unknown) => {
            loginLog.warn({ err }, 'Failed to re-detect auth after login');
          });

        typedRoomHandle.anthropicLoginResps.set(requestId, {
          status: 'done',
          loginUrl: null,
          error: null,
        });
      } else {
        loginLog.error({ exitCode, stdout }, 'Anthropic login failed');
        typedRoomHandle.anthropicLoginResps.set(requestId, {
          status: 'error',
          loginUrl: null,
          error: `Login failed (exit code ${exitCode})`,
        });
      }

      scheduleEphemeralCleanup(() => {
        typedRoomHandle.anthropicLoginReqs.delete(requestId);
        typedRoomHandle.anthropicLoginResps.delete(requestId);
      }, EPHEMERAL_CLEANUP_DELAY_MS);
      processedRequestIds.delete(requestId);
    });

    child.on('error', (err) => {
      loginLog.error({ err: err.message }, 'Failed to spawn claude auth login');
      typedRoomHandle.anthropicLoginResps.set(requestId, {
        status: 'error',
        loginUrl: null,
        error: `Failed to start login: ${err.message}`,
      });

      scheduleEphemeralCleanup(() => {
        typedRoomHandle.anthropicLoginReqs.delete(requestId);
        typedRoomHandle.anthropicLoginResps.delete(requestId);
      }, EPHEMERAL_CLEANUP_DELAY_MS);
      processedRequestIds.delete(requestId);
    });
  });

  connection.onStateChange((state) => {
    log.info({ state }, 'Connection state changed');
  });

  const dispatchingTasks = new Set<string>();

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
      dispatchingTasks,
      watchedTasks,
      taskHandles,
      lastProcessedConvLen,
      peerManager,
      env,
      machineId,
      capabilities,
      publishCapabilities,
      branchWatcher,
      keepAwakeManager,
      getKeepAwakeEnabled: () => keepAwakeEnabled,
    });
  });

  connection.connect();

  log.info('Daemon running in serve mode, waiting for tasks...');

  lifecycle.onShutdown(async () => {
    log.info('Shutting down serve mode...');

    branchWatcher.close();
    keepAwakeManager.shutdown();
    keepAwakeUnsub();

    for (const task of activeTasks.values()) {
      task.sessionManager.closeSession();
      task.abortController.abort();
    }
    activeTasks.clear();
    dispatchingTasks.clear();
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
    lastProcessedConvLen.clear();

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
  /** Guards against re-entrant dispatch when change() triggers synchronous Loro subscriptions */
  dispatchingTasks: Set<string>;
  watchedTasks: Map<string, () => void>;
  taskHandles: Map<string, TaskHandleGroup>;
  lastProcessedConvLen: Map<string, number>;
  peerManager: PeerManager;
  env: Env;
  machineId: string;
  capabilities: MachineCapabilities;
  publishCapabilities: (caps: MachineCapabilities) => void;
  branchWatcher: BranchWatcher;
  keepAwakeManager: KeepAwakeManager;
  getKeepAwakeEnabled: () => boolean;
}

const DIFF_DEBOUNCE_MS = 2_000;
const BRANCH_DIFF_DEBOUNCE_MS = 10_000;
const diffDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const branchDiffTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedDiffCapture(
  taskId: string,
  cwd: string,
  taskHandle: TaskHandleGroup,
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
  taskHandle: TaskHandleGroup,
  log: ReturnType<typeof createChildLogger>
): Promise<void> {
  const [unstaged, staged, files] = await Promise.all([
    getUnstagedDiff(cwd),
    getStagedDiff(cwd),
    getChangedFiles(cwd),
  ]);
  change(taskHandle.conv.doc, (draft) => {
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
  taskHandle: TaskHandleGroup,
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
  taskHandle: TaskHandleGroup,
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

  change(taskHandle.conv.doc, (draft) => {
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
  taskHandle: TaskHandleGroup,
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

  change(taskHandle.conv.doc, (draft) => {
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

    case 'cancel-task':
      handleCancelTask(msg, ctx);
      break;

    case 'control-ack':
      ctx.log.debug({ type: msg.type }, 'Control ack echo');
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

  if (ctx.capabilities.anthropicAuth?.status !== 'authenticated') {
    taskLog.error('Not authenticated with Anthropic');
    ctx.connection.send({
      type: 'task-ack',
      requestId,
      taskId,
      accepted: false,
      error: "Not authenticated with Anthropic. Run 'claude auth login' or set ANTHROPIC_API_KEY.",
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

/**
 * Handle a cancel-task message from the browser (relayed via signaling).
 *
 * Aborts the running agent for the given task and responds with control-ack.
 */
function handleCancelTask(
  msg: Extract<PersonalRoomServerMessage, { type: 'cancel-task' }>,
  ctx: MessageHandlerContext
): void {
  const { taskId, requestId } = msg;
  const taskLog = createChildLogger({ mode: 'serve', taskId });

  const activeTask = ctx.activeTasks.get(taskId);
  if (!activeTask) {
    taskLog.warn('Cancel requested but no active task found');
    ctx.connection.send({
      type: 'control-ack',
      requestId,
      taskId,
      action: 'cancel',
      accepted: false,
      error: 'No active agent running for this task',
    });
    return;
  }

  taskLog.info('Canceling active task');
  activeTask.abortController.abort();

  ctx.connection.send({
    type: 'control-ack',
    requestId,
    taskId,
    action: 'cancel',
    accepted: true,
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

  if (ctx.capabilities.anthropicAuth?.status !== 'authenticated') {
    enhanceLog.error('Not authenticated with Anthropic');
    ctx.connection.send({
      type: 'error',
      code: 'not_authenticated',
      message:
        "Not authenticated with Anthropic. Run 'claude auth login' or set ANTHROPIC_API_KEY.",
      requestId,
    });
    processedRequestIds.delete(requestId);
    return;
  }

  const abortController = ctx.lifecycle.createAbortController();
  const timeout = setTimeout(() => abortController.abort(), ENHANCE_PROMPT_TIMEOUT_MS);

  runEnhancePrompt(prompt, requestId, abortController, ctx, enhanceLog)
    .catch((err: unknown) => {
      enhanceLog.error({ err }, 'Enhance prompt failed');
    })
    .finally(() => {
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

  runWorktreeCreate(requestId, sourceRepoPath, branchName, baseRef, setupScript, ctx, wtLog).catch(
    (err: unknown) => {
      wtLog.error({ err }, 'Worktree create handler failed');
    }
  );
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
  const metaDocId = buildTaskMetaDocId(taskId, epoch);
  const convDocId = buildTaskConvDocId(taskId, epoch);
  const reviewDocId = buildTaskReviewDocId(taskId, epoch);
  taskLog.info({ metaDocId, convDocId, reviewDocId, epoch }, 'Watching task documents');

  const metaHandle = ctx.repo.get(metaDocId, TaskMetaDocumentSchema);
  const convHandle = ctx.repo.get(
    convDocId,
    TaskConversationDocumentSchema,
    TaskEphemeralDeclarations
  );
  const reviewHandle = ctx.repo.get(reviewDocId, TaskReviewDocumentSchema);
  const taskHandle: TaskHandleGroup = { meta: metaHandle, conv: convHandle, review: reviewHandle };

  try {
    await Promise.all([
      metaHandle.waitForSync({ kind: 'storage', timeout: 5_000 }),
      convHandle.waitForSync({ kind: 'storage', timeout: 5_000 }),
    ]);
  } catch {
    taskLog.info({ convDocId, metaDocId }, 'No existing task data in storage');
  }

  try {
    await convHandle.waitForSync({ kind: 'network', timeout: 3_000 });
  } catch {
    taskLog.warn(
      { convDocId, timeoutMs: 3_000 },
      'Network sync timed out (browser may not be connected yet)'
    );
  }

  const taskDocs: TaskDocHandles = {
    meta: metaHandle.doc,
    conv: convHandle.doc,
    review: reviewHandle.doc,
  };
  if (recoverOrphanedTask(taskDocs, taskLog)) {
    updateTaskInIndex(ctx.roomDoc, taskId, { status: 'failed', updatedAt: Date.now() });
  }

  const convJson = convHandle.doc.toJSON();
  const lastUserMsg = [...convJson.conversation].reverse().find((m) => m.role === 'user');
  const initialCwd = lastUserMsg?.cwd ?? process.cwd();
  captureBranchDiffState(initialCwd, taskHandle, taskLog).catch((err: unknown) => {
    taskLog.warn({ err }, 'Failed to capture initial branch diff');
  });

  const opCountBefore = convHandle.loroDoc.opCount();
  taskLog.info({ convDocId, opCount: opCountBefore }, 'Doc state before subscribe');

  const unsubscribe = convHandle.subscribe((event) => {
    taskLog.info({ convDocId, eventBy: event.by }, 'Subscription event received');
    onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
  });

  ctx.watchedTasks.set(taskId, unsubscribe);
  ctx.taskHandles.set(taskId, taskHandle);
  taskLog.info({ convDocId }, 'Subscribed to task document changes');

  /**
   * Also check immediately in case the doc already has a pending user message
   * (daemon restart scenario where the browser already wrote the message).
   */
  const opCountAfter = convHandle.loroDoc.opCount();
  taskLog.info({ convDocId, opCount: opCountAfter }, 'Doc state after subscribe');
  if (opCountAfter > 0) {
    const metaJson = metaHandle.doc.toJSON();
    const freshConvJson = convHandle.doc.toJSON();
    taskLog.info(
      {
        convDocId,
        status: metaJson.meta.status,
        conversationLen: freshConvJson.conversation.length,
      },
      'Checking existing doc data'
    );
    onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
  }
}

function promotePendingFollowUps(
  taskHandle: TaskHandleGroup,
  activeTask: ActiveTask | undefined,
  taskLog: ReturnType<typeof createChildLogger>
): void {
  if (!activeTask) return;
  if (activeTask.abortController.signal.aborted) {
    taskLog.debug('Task is being aborted, skipping pending follow-up promotion');
    return;
  }
  const json = taskHandle.conv.doc.toJSON();
  const pending = json.pendingFollowUps ?? [];
  if (pending.length === 0) return;

  /**
   * Always promote from pendingFollowUps → conversation regardless of streaming state.
   * During cleanupTaskRun, closeSession() nulls the input controller (making isStreaming
   * false) before activeTasks.delete runs. Remote CRDT imports during that async gap
   * would otherwise leave messages permanently stuck in pendingFollowUps.
   */
  change(taskHandle.conv.doc, (draft) => {
    const items = draft.pendingFollowUps.toArray();
    for (const msg of items) {
      draft.conversation.push(msg);
    }
    if (draft.pendingFollowUps.length > 0) {
      draft.pendingFollowUps.delete(0, draft.pendingFollowUps.length);
    }
  });

  taskLog.info({ pendingCount: pending.length }, 'Promoted pending follow-ups to conversation');

  if (!activeTask.sessionManager.isStreaming) {
    taskLog.debug('Task not streaming, skipping follow-up dispatch');
    return;
  }

  const allContentBlocks = pending.flatMap((msg) =>
    msg.content.filter((block: { type: string }) => block.type === 'text' || block.type === 'image')
  );
  if (allContentBlocks.length === 0) return;

  const dispatchFollowUp = () => {
    try {
      activeTask.lastDispatchedConvLen = json.conversation.length + pending.length;
      activeTask.sessionManager.sendFollowUp(allContentBlocks);
    } catch (err: unknown) {
      taskLog.warn({ err }, 'Failed to send promoted follow-up');
    }
  };

  const lastPending = pending[pending.length - 1];
  const mappedMode = lastPending?.permissionMode
    ? mapPermissionMode(lastPending.permissionMode)
    : undefined;

  if (mappedMode) {
    activeTask.sessionManager
      .setPermissionMode(mappedMode)
      .then(dispatchFollowUp)
      .catch((err: unknown) => {
        taskLog.warn({ err }, 'Failed to update permission mode from queued message');
        dispatchFollowUp();
      });
  } else {
    dispatchFollowUp();
  }
}

/**
 * Move orphaned pending follow-ups into the main conversation list.
 * Returns the number of promoted messages.
 */
function promoteOrphanedFollowUps(
  taskHandle: TaskHandleGroup,
  convJson: ReturnType<TaskHandleGroup['conv']['doc']['toJSON']>,
  taskLog: ReturnType<typeof createChildLogger>
): number {
  const pendingFollowUps = convJson.pendingFollowUps ?? [];
  if (pendingFollowUps.length === 0) return 0;

  taskLog.info({ pendingCount: pendingFollowUps.length }, 'Promoting orphaned pending follow-ups');
  change(taskHandle.conv.doc, (draft) => {
    const items = draft.pendingFollowUps.toArray();
    for (const msg of items) {
      draft.conversation.push(msg);
    }
    if (draft.pendingFollowUps.length > 0) {
      draft.pendingFollowUps.delete(0, draft.pendingFollowUps.length);
    }
  });
  return pendingFollowUps.length;
}

/**
 * Called when a task document changes (from a remote import).
 * Checks if there is new work to do and dispatches accordingly.
 */
function onTaskDocChanged(
  taskId: string,
  taskHandle: TaskHandleGroup,
  taskLog: ReturnType<typeof createChildLogger>,
  ctx: MessageHandlerContext
): void {
  const metaJson = taskHandle.meta.doc.toJSON();
  const convJson = taskHandle.conv.doc.toJSON();

  taskLog.info(
    {
      status: metaJson.meta.status,
      conversationLen: convJson.conversation.length,
      lastRole: convJson.conversation[convJson.conversation.length - 1]?.role,
      isActive: ctx.activeTasks.has(taskId),
    },
    'onTaskDocChanged evaluation'
  );

  if (ctx.activeTasks.has(taskId)) {
    const pendingFollowUps = convJson.pendingFollowUps ?? [];
    if (pendingFollowUps.length > 0) {
      promotePendingFollowUps(taskHandle, ctx.activeTasks.get(taskId), taskLog);
    }

    const conversation = convJson.conversation;
    const activeLastUserMsg = [...conversation].reverse().find((m) => m.role === 'user');
    const activeCwd = activeLastUserMsg?.cwd ?? process.cwd();
    debouncedDiffCapture(taskId, activeCwd, taskHandle, taskLog);
    debouncedBranchDiffCapture(taskId, activeCwd, taskHandle, taskLog);
    return;
  }

  if (ctx.dispatchingTasks.has(taskId)) {
    taskLog.debug('Already dispatching, skipping re-entrant call');
    return;
  }

  ctx.dispatchingTasks.add(taskId);

  const promotedCount = promoteOrphanedFollowUps(taskHandle, convJson, taskLog);

  const freshConvJson = taskHandle.conv.doc.toJSON();
  const conversation = freshConvJson.conversation;
  const prevLen = ctx.lastProcessedConvLen.get(taskId) ?? 0;

  const gateResult = shouldDispatchNewWork({
    conversation,
    lastProcessedConvLen: prevLen,
    isActive: false,
  });

  if (!gateResult.dispatch) {
    ctx.dispatchingTasks.delete(taskId);
    if (promotedCount > 0) {
      taskLog.warn(
        { taskId, pendingCount: promotedCount, reason: gateResult.reason },
        'Promoted pending follow-ups but dispatch blocked'
      );
    } else {
      taskLog.debug(
        {
          reason: gateResult.reason,
          conversationLen: conversation.length,
          lastProcessed: prevLen,
          lastRole: conversation[conversation.length - 1]?.role,
        },
        'onTaskDocChanged skipped dispatch'
      );
    }
    return;
  }

  const lastUserMessage = gateResult.lastUserMessage;
  taskLog.info(
    { prevLen, newLen: conversation.length, messageId: lastUserMessage.messageId },
    'New user message detected, starting agent'
  );

  const cwd = lastUserMessage.cwd ?? process.cwd();
  const model = lastUserMessage.model ?? undefined;
  const permissionMode = mapPermissionMode(lastUserMessage.permissionMode);
  const effort = lastUserMessage.reasoningEffort ?? undefined;

  const abortController = ctx.lifecycle.createAbortController();

  const onStatusChange: StatusChangeCallback = (status) => {
    updateTaskInIndex(ctx.roomDoc, taskId, { status, updatedAt: Date.now() });
  };
  const taskDocs: TaskDocHandles = {
    meta: taskHandle.meta.doc,
    conv: taskHandle.conv.doc,
    review: taskHandle.review.doc,
  };
  const manager = new SessionManager(taskDocs, onStatusChange);

  const activeTask: ActiveTask = {
    taskId,
    abortController,
    sessionManager: manager,
    lastDispatchedConvLen: conversation.length,
  };
  ctx.activeTasks.set(taskId, activeTask);
  ctx.keepAwakeManager.update(ctx.getKeepAwakeEnabled(), true);
  ctx.lastProcessedConvLen.set(taskId, conversation.length);

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
          error: result.error,
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
        .catch((cleanupErr: unknown) => {
          taskLog.warn({ err: cleanupErr }, 'cleanupTaskRun failed');
        })
        .finally(() => {
          ctx.dispatchingTasks.delete(taskId);
        })
    );
}

interface CleanupTaskRunOptions {
  taskId: string;
  cwd: string;
  taskHandle: TaskHandleGroup;
  taskLog: ReturnType<typeof createChildLogger>;
  turnStartRefPromise: Promise<string | null>;
  abortController: AbortController;
  ctx: MessageHandlerContext;
}

async function cleanupTaskRun(opts: CleanupTaskRunOptions): Promise<void> {
  const { taskId, cwd, taskHandle, taskLog, turnStartRefPromise, abortController, ctx } = opts;

  const activeTask = ctx.activeTasks.get(taskId);
  activeTask?.sessionManager.closeSession();
  abortController.abort();

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

  for (const [key] of taskHandle.conv.permReqs.getAll()) {
    taskHandle.conv.permReqs.delete(key);
  }
  for (const [key] of taskHandle.conv.permResps.getAll()) {
    taskHandle.conv.permResps.delete(key);
  }

  ctx.activeTasks.delete(taskId);
  ctx.keepAwakeManager.update(ctx.getKeepAwakeEnabled(), ctx.activeTasks.size > 0);
  ctx.signaling.updateStatus('idle');

  onTaskDocChanged(taskId, taskHandle, taskLog, ctx);
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
function mapPermissionMode(mode: string | null): PermissionMode | undefined {
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
  taskHandle: TaskHandleGroup;
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
  taskHandle: TaskHandleGroup,
  taskLog: ReturnType<typeof createChildLogger>,
  toolUseID: string,
  value: { decision: string; persist: boolean; message: string | null }
): void {
  const plans = taskHandle.review.doc.toJSON().plans;
  const planIndex = plans.findIndex((p) => p.toolUseId === toolUseID);
  if (planIndex < 0) return;

  const plan = plans[planIndex];
  if (!plan) return;

  const reviewStatus = value.decision === 'approved' ? 'approved' : 'changes-requested';
  const editedMarkdown = serializePlanEditorDoc(taskHandle.review.loroDoc, plan.planId);

  const allComments = taskHandle.review.doc.toJSON().planComments;
  const planComments = Object.values(allComments).filter(
    (c) => c.planId === plan.planId && c.resolvedAt === null
  );

  const richFeedback = formatPlanFeedbackForClaudeCode(
    plan.markdown,
    editedMarkdown || plan.markdown,
    planComments,
    value.message ?? null
  );

  change(taskHandle.review.doc, (draft) => {
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
 * Handle AskUserQuestion permission response: parse the user's answers
 * from the browser's JSON message and merge them into the tool input so
 * the SDK receives `{ ...originalInput, answers: { ... } }`.
 *
 * Returns a (possibly enriched) copy of `input`.
 */
function resolveAskUserQuestion(
  taskLog: ReturnType<typeof createChildLogger>,
  toolUseID: string,
  input: Record<string, unknown>,
  value: { decision: string; persist: boolean; message: string | null }
): Record<string, unknown> {
  if (value.decision !== 'approved' || !value.message) return input;

  try {
    // eslint-disable-next-line no-restricted-syntax -- JSON.parse returns unknown; shape validated on next line
    const parsed = JSON.parse(value.message) as Record<string, unknown>;
    if (
      'answers' in parsed &&
      parsed.answers &&
      typeof parsed.answers === 'object' &&
      !Array.isArray(parsed.answers)
    ) {
      taskLog.info({ toolUseID }, 'Merged AskUserQuestion answers into input');
      return { ...input, answers: parsed.answers };
    }
  } catch {
    taskLog.warn({ toolUseID }, 'Failed to parse AskUserQuestion answers from message');
  }

  return input;
}

/**
 * Process a browser permission response: clean up ephemeral entries,
 * update task status back to 'working', log the response, and return
 * the SDK-compatible PermissionResult.
 */
function resolvePermissionResponse(ctx: PermissionResponseContext): PermissionResult {
  const { taskHandle, roomDoc, taskId, taskLog, toolName, toolUseID, input, suggestions, value } =
    ctx;

  taskHandle.conv.permReqs.delete(toolUseID);
  taskHandle.conv.permResps.delete(toolUseID);

  change(taskHandle.meta.doc, (draft) => {
    draft.meta.status = 'working';
    draft.meta.updatedAt = Date.now();
  });
  updateTaskInIndex(roomDoc, taskId, { status: 'working', updatedAt: Date.now() });

  if (toolName === 'ExitPlanMode') {
    resolveExitPlanMode(taskHandle, taskLog, toolUseID, value);
  }

  let resolvedInput = input;
  if (toolName === 'AskUserQuestion') {
    resolvedInput = resolveAskUserQuestion(taskLog, toolUseID, input, value);
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
  const resultMessage =
    toolName === 'AskUserQuestion' && decision === 'approved' ? null : value.message;
  return toPermissionResult(decision, resolvedInput, suggestions, resultMessage);
}

function buildCanUseTool(
  taskHandle: TaskHandleGroup,
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

    taskHandle.conv.permReqs.set(toolUseID, {
      toolName,
      toolInput: JSON.stringify(input),
      riskLevel,
      reason: decisionReason ?? null,
      blockedPath: blockedPath ?? null,
      description: null,
      agentId: agentID ?? null,
      createdAt: Date.now(),
    });

    change(taskHandle.meta.doc, (draft) => {
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
      const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;
      let settled = false;
      let unsub: (() => void) | undefined;

      const settle = (result: PermissionResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub?.();
        signal.removeEventListener('abort', onAbort);
        taskHandle.conv.permReqs.delete(toolUseID);
        change(taskHandle.meta.doc, (draft) => {
          draft.meta.status = 'working';
          draft.meta.updatedAt = Date.now();
        });
        updateTaskInIndex(roomDoc, taskId, { status: 'working', updatedAt: Date.now() });
        resolve(result);
      };

      const timeout = setTimeout(() => {
        taskLog.warn({ toolName, toolUseID }, 'Permission request timed out');
        settle({ behavior: 'deny', message: 'Permission request timed out' });
      }, PERMISSION_TIMEOUT_MS);

      const onAbort = () => {
        settle({ behavior: 'deny', message: 'Task was aborted' });
      };

      signal.addEventListener('abort', onAbort, { once: true });

      unsub = taskHandle.conv.permResps.subscribe(({ key, value, source }) => {
        if (source === 'local') return;
        if (key !== toolUseID || !value) return;

        settle(
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

/**
 * Collect formatted feedback strings from unresolved plan comments,
 * grouped by planId with plan context (original + edited markdown).
 */
function collectPlanFeedback(
  unresolvedPlan: PlanComment[],
  plans: Array<{ planId: string; markdown: string }>,
  loroDoc: import('loro-crdt').LoroDoc
): string[] {
  const parts: string[] = [];
  const byPlanId = new Map<string, typeof unresolvedPlan>();
  for (const c of unresolvedPlan) {
    const existing = byPlanId.get(c.planId) ?? [];
    existing.push(c);
    byPlanId.set(c.planId, existing);
  }

  for (const [planId, comments] of byPlanId) {
    const plan = plans.find((p) => p.planId === planId);
    const originalMarkdown = plan?.markdown ?? '';
    const editedMarkdown = serializePlanEditorDoc(loroDoc, planId) || originalMarkdown;
    const feedback = formatPlanFeedbackForClaudeCode(
      originalMarkdown,
      editedMarkdown,
      comments,
      null
    );
    if (feedback) {
      parts.push(feedback);
    }
  }

  return parts;
}

/**
 * Safety-net comment harvesting: gather unresolved, undelivered diff and plan
 * comments from the CRDT and append them as text content blocks to the user
 * message. The browser may have already included these in the message text,
 * but this catches any that were missed.
 *
 * After harvesting, the comment IDs are written to deliveredCommentIds to
 * prevent re-delivery on subsequent turns.
 */
function harvestUndeliveredComments(
  taskHandle: TaskHandleGroup,
  contentBlocks: Array<{ type: string; text?: string }>,
  log: ReturnType<typeof createChildLogger>
): void {
  const reviewJson = taskHandle.review.doc.toJSON();
  const deliveredSet = new Set(reviewJson.deliveredCommentIds ?? []);

  const unresolvedDiff = Object.values(reviewJson.diffComments).filter(
    (c) => c.resolvedAt === null && !deliveredSet.has(c.commentId)
  );
  const unresolvedPlan = Object.values(reviewJson.planComments).filter(
    (c) => c.resolvedAt === null && !deliveredSet.has(c.commentId)
  );

  if (unresolvedDiff.length === 0 && unresolvedPlan.length === 0) {
    return;
  }

  const feedbackParts: string[] = [];

  if (unresolvedDiff.length > 0) {
    const diffFeedback = formatDiffFeedbackForClaudeCode(unresolvedDiff, null);
    if (diffFeedback) {
      feedbackParts.push(diffFeedback);
    }
  }

  if (unresolvedPlan.length > 0) {
    feedbackParts.push(
      ...collectPlanFeedback(unresolvedPlan, reviewJson.plans, taskHandle.review.loroDoc)
    );
  }

  if (feedbackParts.length === 0) {
    return;
  }

  const feedbackText = `\n\n---\n**User feedback on your changes (comments from code review):**\n\n${feedbackParts.join('\n\n')}`;
  contentBlocks.push({ type: 'text', text: feedbackText });

  const harvestedIds = [
    ...unresolvedDiff.map((c) => c.commentId),
    ...unresolvedPlan.map((c) => c.commentId),
  ];

  change(taskHandle.review.doc, (draft) => {
    for (const id of harvestedIds) {
      draft.deliveredCommentIds.push(id);
    }
  });

  log.info(
    { diffCommentCount: unresolvedDiff.length, planCommentCount: unresolvedPlan.length },
    'Harvested undelivered comments as safety net'
  );
}

interface RunTaskOptions {
  sessionManager: SessionManager;
  taskHandle: TaskHandleGroup;
  taskId: string;
  roomDoc: TypedDoc<TaskIndexDocumentShape>;
  cwd: string;
  model?: string;
  permissionMode?: PermissionMode;
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

  harvestUndeliveredComments(taskHandle, contentBlocks, log);

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

  const canUseTool = buildCanUseTool(taskHandle, log, roomDoc, taskId);

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
    try {
      return await manager.resumeSession(resumeInfo.sessionId, contentBlocks, {
        abortController,
        machineId,
        model,
        permissionMode,
        effort,
        canUseTool,
        stderr,
        allowDangerouslySkipPermissions: true,
      });
    } catch (err) {
      log.warn(
        { err, sessionId: resumeInfo.sessionId },
        'Resume failed, falling back to new session'
      );
    }
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
    allowDangerouslySkipPermissions: true,
  });
}
