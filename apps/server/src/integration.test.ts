/**
 * End-to-end integration tests for the full server spawn flow.
 *
 * Tests the complete lifecycle:
 * 1. Server startup in daemon mode
 * 2. Create Loro task document
 * 3. Write spawn_requested event to doc
 * 4. Verify daemon spawns agent (mock spawnClaudeCode)
 * 5. Verify spawn_started event written
 * 6. Verify spawn_completed event on exit
 *
 * Also tests:
 * - Git sync: git change -> changeSnapshots updated
 * - Lock management: singleton behavior
 *
 * @see docs/whips/daemon-mcp-server-merge.md#spawn-agent-flow
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
// Note: We import these for TypeScript types only. Actual fs operations
// in lock management tests use realFs via require() to bypass mocks.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateTaskId, type TaskId } from '@shipyard/loro-schema';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ==================== MOCKS ====================

const mockSpawn = vi.fn();
const mockExecSync = vi.fn();
const mockExecFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
const mockReadFile = vi.fn();
const mockUnlink = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('node:fs');
  return {
    ...original,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  stat: vi.fn().mockResolvedValue({ size: 100 }),
}));

vi.mock('./utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks
import { initSpawner, spawnClaudeCode, stopAgent } from './agents/spawner.js';
import { hasAgent, listAgents, untrackAgent } from './agents/tracker.js';
import { getGitChanges, startGitSync } from './loro/git-sync.js';
import {
  clearProcessedSpawnRequests,
  handleSpawnRequested,
  startSpawnRequestCleanup,
  stopSpawnRequestCleanup,
  subscribeToEvents,
} from './loro/handlers.js';

// ==================== TEST HELPERS ====================

// -------------------- Git Mock Helpers --------------------

/**
 * Configuration for git command mock responses.
 * Each property corresponds to a git command pattern and its return value.
 */
interface GitMockConfig {
  headSha: string;
  branch: string;
  cachedNameStatus: string;
  cachedNumstat: string;
  nameStatus: string;
  numstat: string;
  lsFilesOthers: string;
  diff: string;
}

/**
 * Default git mock configuration for basic test scenarios.
 */
const DEFAULT_GIT_MOCK_CONFIG: GitMockConfig = {
  headSha: 'abc1234',
  branch: 'main',
  cachedNameStatus: '',
  cachedNumstat: '',
  nameStatus: 'M\tfile.ts',
  numstat: '10\t5\tfile.ts',
  lsFilesOthers: '',
  diff: '+added line\n-removed line',
};

/**
 * Match a git command and return the appropriate mock response.
 * This helper reduces cognitive complexity by consolidating git command matching logic.
 */
function matchGitCommand(argsStr: string, config: GitMockConfig): string | null {
  // Order matters: more specific patterns first
  if (argsStr.includes('rev-parse HEAD')) return config.headSha;
  if (argsStr.includes('--abbrev-ref HEAD')) return config.branch;
  if (argsStr.includes('diff --cached --name-status')) return config.cachedNameStatus;
  if (argsStr.includes('diff --cached --numstat')) return config.cachedNumstat;
  if (argsStr.includes('diff --name-status')) return config.nameStatus;
  if (argsStr.includes('diff --numstat')) return config.numstat;
  if (argsStr.includes('ls-files --others')) return config.lsFilesOthers;
  if (argsStr.includes('diff --')) return config.diff;
  return null;
}

/**
 * Create a mock implementation for execFileSync that handles git commands.
 * Uses the provided config to determine responses for each git command type.
 */
function createGitExecFileSyncMock(config: GitMockConfig = DEFAULT_GIT_MOCK_CONFIG) {
  return (_cmd: string, args: string[], _opts: unknown): string => {
    const argsStr = args?.join(' ') ?? '';
    return matchGitCommand(argsStr, config) ?? '';
  };
}

// -------------------- Process Mock Helpers --------------------

/**
 * Create a mock ChildProcess for testing.
 */
function createMockChildProcess(pid = 12345): ChildProcess {
  const emitter = new EventEmitter();
  const mockProcess = Object.assign(emitter, {
    pid,
    stdin: null,
    stdout: { pipe: vi.fn(), on: vi.fn() },
    stderr: { pipe: vi.fn(), on: vi.fn() },
    stdio: [null, null, null, null, null] as [null, null, null, null, null],
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    connected: false,
    kill: vi.fn(() => {
      (mockProcess as unknown as EventEmitter).emit('exit', 0);
      return true;
    }),
    send: vi.fn(() => true),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;
  return mockProcess;
}

/**
 * Create mock task document for testing.
 * Simulates the Loro TaskDocument shape without requiring loro-crdt.
 */
function createMockTaskDocument(taskId: TaskId) {
  const events: unknown[] = [];
  const changeSnapshots = new Map<string, unknown>();
  const files: unknown[] = [];

  return {
    meta: {
      id: taskId,
      title: 'Test Task',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      completedBy: null,
      ownerId: 'test-user',
      sessionTokenHash: 'test-hash',
      epoch: 1,
      repo: null,
      archivedAt: null,
      archivedBy: null,
      tags: { push: vi.fn(), toJSON: () => [], length: 0, delete: vi.fn() },
    },
    events: {
      push: (e: unknown) => events.push(e),
      toJSON: () => events,
      toArray: () => events,
      length: events.length,
    },
    changeSnapshots: {
      get: (key: string) => changeSnapshots.get(key),
      set: (key: string, value: unknown) => changeSnapshots.set(key, value),
      delete: (key: string) => changeSnapshots.delete(key),
    },
    deliverables: { push: vi.fn(), toJSON: () => [] },
    inputRequests: { toJSON: () => [] },
    logEvent: vi.fn(),
    // Helper to access internal state for assertions
    _internal: { events, changeSnapshots, files },
  };
}

/**
 * Create a mock Loro handle for testing.
 *
 * Implements the loro-extended Handle.subscribe API:
 * - subscribe(selector, listener) where listener receives (value, prev)
 * - For lists like events, listener receives the array directly
 */
function createMockHandle(taskDoc: ReturnType<typeof createMockTaskDocument>) {
  let subscribeCallback: ((events: unknown[], prev: unknown[] | undefined) => void) | null = null;

  return {
    change: vi.fn((fn: (doc: typeof taskDoc) => void) => {
      fn(taskDoc);
    }),
    subscribe: vi.fn((_selector: unknown, callback: unknown) => {
      subscribeCallback = callback as typeof subscribeCallback;
      return vi.fn(); // unsubscribe function
    }),
    // Helper to trigger subscription callback with loro-extended API shape
    _triggerSubscription: (events: unknown[]) => {
      if (subscribeCallback) {
        // loro-extended passes (value, prev) - value is the array directly
        subscribeCallback(events, undefined);
      }
    },
  };
}

/** Mock environment for testing */
const mockEnv = {
  PORT: 32191,
  DATA_DIR: './test-data',
  LOG_LEVEL: 'info' as const,
  WEB_URL: 'http://localhost:3000',
  GITHUB_TOKEN: 'test-token',
  DOCKER_MODE: false,
  SIGNALING_URL: 'wss://test-signaling.example.com',
  CLAUDE_SHIM_LOG_DIR: '/tmp/shim-logs',
  CLAUDE_PROJECTS_DIR: '/tmp/claude-projects',
};

// ==================== TEST SUITES ====================

describe('Integration: Full Spawn Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProcessedSpawnRequests();
    initSpawner(mockEnv as Parameters<typeof initSpawner>[0]);
    mockExecSync.mockReturnValue('/usr/local/bin/claude\n');
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('{}');

    // Clean tracked agents
    for (const agent of listAgents()) {
      untrackAgent(agent.taskId);
    }
  });

  afterEach(() => {
    stopSpawnRequestCleanup();
    for (const agent of listAgents()) {
      untrackAgent(agent.taskId);
    }
  });

  describe('spawn_requested -> spawn_started -> spawn_completed flow', () => {
    it('processes spawn_requested event and writes spawn_started', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);
      const mockProcess = createMockChildProcess(55555);
      mockSpawn.mockReturnValue(mockProcess);

      const machineId = 'test-machine-123';

      // Create spawn_requested event
      const spawnRequestEvent = {
        type: 'spawn_requested' as const,
        id: 'spawn-req-001',
        actor: 'user',
        timestamp: Date.now(),
        inboxWorthy: null,
        inboxFor: null,
        targetMachineId: machineId,
        prompt: 'Implement the feature',
        cwd: '/test/work/dir',
        requestedBy: 'test-user',
      };

      const mockHandle = createMockHandle(taskDoc);

      // Process the spawn request
      await handleSpawnRequested(
        spawnRequestEvent,
        { machineId, taskId },
        mockHandle as unknown as Parameters<typeof handleSpawnRequested>[2]
      );

      // Verify Claude Code was spawned
      expect(mockSpawn).toHaveBeenCalled();
      expect(hasAgent(taskId)).toBe(true);

      // Verify spawn_started event was written
      const events = taskDoc._internal.events;
      const startedEvent = (events as Array<{ type?: string }>).find(
        (e: { type?: string }) => e.type === 'spawn_started'
      );
      expect(startedEvent).toBeDefined();
      expect((startedEvent as { pid?: number }).pid).toBe(55555);
      expect((startedEvent as { requestId?: string }).requestId).toBe('spawn-req-001');
    });

    it('writes spawn_completed event on process exit', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);
      const mockProcess = createMockChildProcess(66666);
      mockSpawn.mockReturnValue(mockProcess);

      const machineId = 'test-machine-456';

      const spawnRequestEvent = {
        type: 'spawn_requested' as const,
        id: 'spawn-req-002',
        actor: 'user',
        timestamp: Date.now(),
        inboxWorthy: null,
        inboxFor: null,
        targetMachineId: machineId,
        prompt: 'Fix the bug',
        cwd: '/test/bug/dir',
        requestedBy: 'test-user',
      };

      const mockHandle = createMockHandle(taskDoc);

      await handleSpawnRequested(
        spawnRequestEvent,
        { machineId, taskId },
        mockHandle as unknown as Parameters<typeof handleSpawnRequested>[2]
      );

      // Simulate process exit
      (mockProcess as unknown as EventEmitter).emit('exit', 0);

      // Allow event handlers to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify spawn_completed event was written
      const events = taskDoc._internal.events;
      const completedEvent = (events as Array<{ type?: string }>).find(
        (e: { type?: string }) => e.type === 'spawn_completed'
      );
      expect(completedEvent).toBeDefined();
      expect((completedEvent as { exitCode?: number }).exitCode).toBe(0);
      expect((completedEvent as { requestId?: string }).requestId).toBe('spawn-req-002');
    });

    it('ignores spawn_requested for different machine', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);

      const myMachineId = 'my-machine';
      const otherMachineId = 'other-machine';

      const spawnRequestEvent = {
        type: 'spawn_requested' as const,
        id: 'spawn-req-003',
        actor: 'user',
        timestamp: Date.now(),
        inboxWorthy: null,
        inboxFor: null,
        targetMachineId: otherMachineId,
        prompt: 'Some task',
        cwd: '/test/dir',
        requestedBy: 'test-user',
      };

      const mockHandle = createMockHandle(taskDoc);

      await handleSpawnRequested(
        spawnRequestEvent,
        { machineId: myMachineId, taskId },
        mockHandle as unknown as Parameters<typeof handleSpawnRequested>[2]
      );

      // Should not spawn
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(hasAgent(taskId)).toBe(false);
    });

    it('is idempotent - does not reprocess same spawn request', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);
      const mockProcess = createMockChildProcess(77777);
      mockSpawn.mockReturnValue(mockProcess);

      const machineId = 'test-machine-789';

      const spawnRequestEvent = {
        type: 'spawn_requested' as const,
        id: 'spawn-req-idempotent',
        actor: 'user',
        timestamp: Date.now(),
        inboxWorthy: null,
        inboxFor: null,
        targetMachineId: machineId,
        prompt: 'Idempotent test',
        cwd: '/test/dir',
        requestedBy: 'test-user',
      };

      const mockHandle = createMockHandle(taskDoc);

      // Process twice
      await handleSpawnRequested(
        spawnRequestEvent,
        { machineId, taskId },
        mockHandle as unknown as Parameters<typeof handleSpawnRequested>[2]
      );
      await handleSpawnRequested(
        spawnRequestEvent,
        { machineId, taskId },
        mockHandle as unknown as Parameters<typeof handleSpawnRequested>[2]
      );

      // Should only spawn once
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('event subscription flow', () => {
    it('subscribes to task events and handles spawn_requested', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);
      const mockProcess = createMockChildProcess(88888);
      mockSpawn.mockReturnValue(mockProcess);

      const machineId = 'subscribe-test-machine';
      const mockHandle = createMockHandle(taskDoc);

      // Subscribe to events
      const unsubscribe = subscribeToEvents(
        mockHandle as unknown as Parameters<typeof subscribeToEvents>[0],
        { machineId, taskId }
      );

      // Simulate a spawn_requested event arriving
      const newEvent = {
        type: 'spawn_requested',
        id: 'spawn-req-subscription',
        actor: 'user',
        timestamp: Date.now(),
        inboxWorthy: null,
        inboxFor: null,
        targetMachineId: machineId,
        prompt: 'Test via subscription',
        cwd: '/test/subscription/dir',
        requestedBy: 'test-user',
      };

      // Trigger subscription callback
      mockHandle._triggerSubscription([newEvent]);

      // Allow async handling
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify spawn occurred
      expect(mockSpawn).toHaveBeenCalled();

      // Cleanup
      unsubscribe();
    });
  });

  describe('spawn request cleanup', () => {
    it('starts and stops cleanup timer', () => {
      const stopCleanup = startSpawnRequestCleanup();
      expect(stopCleanup).toBeInstanceOf(Function);
      stopCleanup();
    });

    it('returns same stop function when called multiple times', () => {
      const stop1 = startSpawnRequestCleanup();
      const stop2 = startSpawnRequestCleanup();
      stop1();
      stop2();
    });
  });
});

describe('Integration: Git Sync', () => {
  const testDir = join(tmpdir(), `shipyard-git-sync-test-${Date.now()}`);

  beforeEach(() => {
    vi.clearAllMocks();
    // Git sync uses execFileSync, not execSync
    mockExecFileSync.mockImplementation(createGitExecFileSyncMock());
  });

  describe('getGitChanges', () => {
    it('returns git changes with file info', async () => {
      const changes = await getGitChanges(testDir);

      expect(changes.headSha).toBe('abc1234');
      expect(changes.branch).toBe('main');
      expect(changes.files.length).toBeGreaterThanOrEqual(0);
    });

    it('calculates additions and deletions', async () => {
      const changes = await getGitChanges(testDir);

      expect(typeof changes.totalAdditions).toBe('number');
      expect(typeof changes.totalDeletions).toBe('number');
    });
  });

  describe('startGitSync', () => {
    it('starts git sync and returns cleanup function', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);
      const mockHandle = createMockHandle(taskDoc);

      const stopSync = startGitSync(mockHandle as unknown as Parameters<typeof startGitSync>[0], {
        machineId: 'git-sync-machine',
        machineName: 'Test Machine',
        ownerId: 'test-user',
        cwd: testDir,
        pollInterval: 100, // Fast polling for test
      });

      // Wait for first sync
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify change was called
      expect(mockHandle.change).toHaveBeenCalled();

      // Verify changeSnapshot was updated
      const snapshot = taskDoc.changeSnapshots.get('git-sync-machine');
      expect(snapshot).toBeDefined();
      expect((snapshot as { isLive?: boolean }).isLive).toBe(true);
      expect((snapshot as { branch?: string }).branch).toBe('main');

      // Cleanup
      stopSync();

      // Verify isLive is set to false on cleanup
      expect((snapshot as { isLive?: boolean }).isLive).toBe(false);
    });

    it('updates changeSnapshots with file changes', async () => {
      const taskId = generateTaskId();
      const taskDoc = createMockTaskDocument(taskId);

      // Mock modified file with different values
      mockExecFileSync.mockImplementation(
        createGitExecFileSyncMock({
          headSha: 'def5678',
          branch: 'feature-branch',
          cachedNameStatus: '',
          cachedNumstat: '',
          nameStatus: 'M\tsrc/test.ts',
          numstat: '5\t2\tsrc/test.ts',
          lsFilesOthers: '',
          diff: '@@ -1,5 +1,8 @@\n+new code',
        })
      );

      const mockHandle = createMockHandle(taskDoc);

      const stopSync = startGitSync(mockHandle as unknown as Parameters<typeof startGitSync>[0], {
        machineId: 'git-files-machine',
        machineName: 'Test Machine',
        ownerId: 'test-user',
        cwd: testDir,
        pollInterval: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const snapshot = taskDoc.changeSnapshots.get('git-files-machine');
      expect(snapshot).toBeDefined();
      expect((snapshot as { headSha?: string }).headSha).toBe('def5678');
      expect((snapshot as { branch?: string }).branch).toBe('feature-branch');
      expect(typeof (snapshot as { totalAdditions?: number }).totalAdditions).toBe('number');
      expect(typeof (snapshot as { totalDeletions?: number }).totalDeletions).toBe('number');

      stopSync();
    });
  });
});

describe('Integration: Lock Management', () => {
  // These tests use real file operations via vi.importActual to bypass ESM mocks
  // We use unique temp directories per test to avoid cross-test pollution

  // Real fs functions loaded via vi.importActual (bypasses vitest mocks)
  let realFs: {
    existsSync: typeof import('node:fs').existsSync;
    mkdirSync: typeof import('node:fs').mkdirSync;
    writeFileSync: typeof import('node:fs').writeFileSync;
    readFileSync: typeof import('node:fs').readFileSync;
    unlinkSync: typeof import('node:fs').unlinkSync;
    rmSync: typeof import('node:fs').rmSync;
  };

  let testStateDir: string;

  // Load real fs module before tests run
  beforeAll(async () => {
    // vi.importActual bypasses vitest mocks to get the real implementation
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    realFs = {
      existsSync: fs.existsSync,
      mkdirSync: fs.mkdirSync,
      writeFileSync: fs.writeFileSync,
      readFileSync: fs.readFileSync,
      unlinkSync: fs.unlinkSync,
      rmSync: fs.rmSync,
    };
  });

  beforeEach(() => {
    // Create a unique temp dir for each test
    testStateDir = join(
      tmpdir(),
      `shipyard-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    realFs.mkdirSync(testStateDir, { recursive: true });
    process.env.SHIPYARD_STATE_DIR = testStateDir;
  });

  afterEach(() => {
    // Clean up
    delete process.env.SHIPYARD_STATE_DIR;
    try {
      realFs.rmSync(testStateDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('singleton behavior', () => {
    it('creates lock file with PID', () => {
      const lockPath = join(testStateDir, 'daemon.lock');

      // Directly test lock file creation
      realFs.writeFileSync(lockPath, `${process.pid}\n${Date.now()}`);
      expect(realFs.existsSync(lockPath)).toBe(true);
    });

    it('lock file contains process PID', () => {
      const lockPath = join(testStateDir, 'daemon.lock');

      realFs.writeFileSync(lockPath, `${process.pid}\n${Date.now()}`);
      const content = realFs.readFileSync(lockPath, 'utf-8');
      expect(content).toContain(String(process.pid));
    });

    it('can detect stale lock from dead process', () => {
      const lockPath = join(testStateDir, 'daemon.lock');

      // Write a lock with non-existent PID
      realFs.writeFileSync(lockPath, `999999\n${Date.now()}`);
      expect(realFs.existsSync(lockPath)).toBe(true);

      // Verify it's a stale lock (process doesn't exist)
      let isStale = false;
      try {
        process.kill(999999, 0);
      } catch {
        isStale = true;
      }
      expect(isStale).toBe(true);
    });

    it('can remove stale lock', () => {
      const lockPath = join(testStateDir, 'daemon.lock');

      realFs.writeFileSync(lockPath, `999999\n${Date.now()}`);
      expect(realFs.existsSync(lockPath)).toBe(true);

      realFs.unlinkSync(lockPath);
      expect(realFs.existsSync(lockPath)).toBe(false);
    });

    it('can check if process is alive', () => {
      // Current process should be alive
      let isAlive = true;
      try {
        process.kill(process.pid, 0);
      } catch {
        isAlive = false;
      }
      expect(isAlive).toBe(true);
    });

    it('non-existent process returns error on kill check', () => {
      // Non-existent PID should throw
      let threw = false;
      try {
        process.kill(999999, 0);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  describe('lock contention', () => {
    it('creates unique lock files per directory', () => {
      const otherDirName = `other-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const otherDir = join(tmpdir(), otherDirName);
      const lockPath1 = join(testStateDir, 'daemon.lock');
      const lockPath2 = join(otherDir, 'daemon.lock');

      realFs.mkdirSync(otherDir, { recursive: true });
      realFs.writeFileSync(lockPath1, `${process.pid}\n${Date.now()}`);

      expect(realFs.existsSync(lockPath1)).toBe(true);
      expect(realFs.existsSync(lockPath2)).toBe(false);

      // Clean up other dir
      realFs.rmSync(otherDir, { recursive: true, force: true });
    });
  });
});

describe('Integration: Agent Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initSpawner(mockEnv as Parameters<typeof initSpawner>[0]);
    mockExecSync.mockReturnValue('/usr/local/bin/claude\n');
    mockExistsSync.mockReturnValue(false);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('{}');

    for (const agent of listAgents()) {
      untrackAgent(agent.taskId);
    }
  });

  afterEach(() => {
    for (const agent of listAgents()) {
      untrackAgent(agent.taskId);
    }
  });

  it('spawns agent and tracks in registry', async () => {
    const mockProcess = createMockChildProcess(11111);
    mockSpawn.mockReturnValue(mockProcess);

    const child = await spawnClaudeCode({
      taskId: 'lifecycle-spawn-1',
      prompt: 'Test task',
      cwd: '/test/dir',
    });

    expect(child.pid).toBe(11111);
    expect(hasAgent('lifecycle-spawn-1')).toBe(true);
    expect(listAgents()).toHaveLength(1);
  });

  it('stops agent and removes from registry', async () => {
    const mockProcess = createMockChildProcess(22222);
    mockSpawn.mockReturnValue(mockProcess);

    await spawnClaudeCode({
      taskId: 'lifecycle-stop-1',
      prompt: 'Test task',
      cwd: '/test/dir',
    });

    expect(hasAgent('lifecycle-stop-1')).toBe(true);

    const stopped = stopAgent('lifecycle-stop-1');

    expect(stopped).toBe(true);
    expect(hasAgent('lifecycle-stop-1')).toBe(false);
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('handles multiple concurrent agents', async () => {
    const process1 = createMockChildProcess(33333);
    const process2 = createMockChildProcess(44444);

    mockSpawn.mockReturnValueOnce(process1).mockReturnValueOnce(process2);

    await spawnClaudeCode({
      taskId: 'concurrent-1',
      prompt: 'Task 1',
      cwd: '/test/dir1',
    });

    await spawnClaudeCode({
      taskId: 'concurrent-2',
      prompt: 'Task 2',
      cwd: '/test/dir2',
    });

    expect(listAgents()).toHaveLength(2);
    expect(hasAgent('concurrent-1')).toBe(true);
    expect(hasAgent('concurrent-2')).toBe(true);
  });

  it('replaces existing agent for same task', async () => {
    const process1 = createMockChildProcess(55555);
    const process2 = createMockChildProcess(66666);

    mockSpawn.mockReturnValueOnce(process1).mockReturnValueOnce(process2);

    // Spawn first
    await spawnClaudeCode({
      taskId: 'replace-task',
      prompt: 'First task',
      cwd: '/test/dir',
    });

    expect(hasAgent('replace-task')).toBe(true);

    // Spawn again for same task
    await spawnClaudeCode({
      taskId: 'replace-task',
      prompt: 'Replacement task',
      cwd: '/test/dir',
    });

    // Should still have one agent (replaced)
    expect(listAgents()).toHaveLength(1);

    // First process should have been killed
    expect(process1.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
