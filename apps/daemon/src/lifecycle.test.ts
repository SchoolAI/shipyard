import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LifecycleManager', () => {
  let originalListeners: Array<{
    event: string | symbol;
    listener: (...args: unknown[]) => void;
  }>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalListeners = [];

    // Track listeners added during tests so we can clean them up
    const originalOn = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation(
      // eslint-disable-next-line no-restricted-syntax -- process.on overloads require broad signature
      ((event: string, listener: (...args: unknown[]) => void) => {
        originalListeners.push({ event, listener });
        return originalOn(event, listener);
      }) as typeof process.on
    );

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const { event, listener } of originalListeners) {
      process.removeListener(event as string, listener);
    }
  });

  it('treats unhandled rejections as non-fatal (no shutdown)', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    const lifecycle = new LifecycleManager();

    const mockExit = vi.mocked(process.exit);

    const rejectionListener = originalListeners.find((l) => l.event === 'unhandledRejection');
    expect(rejectionListener).toBeDefined();

    rejectionListener!.listener(new Error('test rejection'));
    rejectionListener!.listener({ weird: 'object' });
    rejectionListener!.listener('string reason');

    await vi.advanceTimersByTimeAsync(500);

    expect(mockExit).not.toHaveBeenCalled();

    lifecycle.destroy();
  });

  it('treats uncaught exceptions as fatal (triggers shutdown)', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    new LifecycleManager();

    const mockExit = vi.mocked(process.exit);

    const exceptionListener = originalListeners.find((l) => l.event === 'uncaughtException');
    expect(exceptionListener).toBeDefined();

    exceptionListener!.listener(new Error('test exception'));

    await vi.advanceTimersByTimeAsync(500);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('does not call process.exit immediately after shutdown log -- waits for flush', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    // Instantiation registers signal handlers; we need the side effect
    new LifecycleManager();

    const mockExit = vi.mocked(process.exit);

    // Trigger SIGTERM handler
    const sigTermListener = originalListeners.find((l) => l.event === 'SIGTERM');
    expect(sigTermListener).toBeDefined();

    // Fire the handler (async)
    const shutdownPromise = sigTermListener!.listener();

    // At this point, 'Shutdown complete' has been logged but process.exit should
    // NOT have been called yet because we need a flush delay
    expect(mockExit).not.toHaveBeenCalled();

    // Advance timers past the flush delay (100ms)
    await vi.advanceTimersByTimeAsync(150);

    await shutdownPromise;

    // Now process.exit should have been called
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});

describe('PID file management', () => {
  let testDir: string;
  let originalListeners: Array<{
    event: string | symbol;
    listener: (...args: unknown[]) => void;
  }>;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `shipyard-lifecycle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    originalListeners = [];
    const originalOn = process.on.bind(process);
    vi.spyOn(process, 'on').mockImplementation(
      // eslint-disable-next-line no-restricted-syntax -- process.on overloads require broad signature
      ((event: string, listener: (...args: unknown[]) => void) => {
        originalListeners.push({ event, listener });
        return originalOn(event, listener);
      }) as typeof process.on
    );

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const { event, listener } of originalListeners) {
      process.removeListener(event as string, listener);
    }
    await rm(testDir, { recursive: true, force: true });
  });

  it('writes a PID file on acquire', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    const lifecycle = new LifecycleManager();

    await lifecycle.acquirePidFile(testDir);

    const pidFile = join(testDir, 'daemon.pid');
    const content = await readFile(pidFile, 'utf-8');
    expect(content).toBe(String(process.pid));

    lifecycle.destroy();
  });

  it('removes the PID file on destroy()', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    const lifecycle = new LifecycleManager();

    await lifecycle.acquirePidFile(testDir);
    const pidFile = join(testDir, 'daemon.pid');
    expect(existsSync(pidFile)).toBe(true);

    lifecycle.destroy();
    expect(existsSync(pidFile)).toBe(false);
  });

  it('overwrites a stale PID file from a dead process', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');

    const pidFile = join(testDir, 'daemon.pid');
    await writeFile(pidFile, '999999999');

    const lifecycle = new LifecycleManager();
    await lifecycle.acquirePidFile(testDir);

    const content = await readFile(pidFile, 'utf-8');
    expect(content).toBe(String(process.pid));

    lifecycle.destroy();
  });

  it('exits if another daemon is alive with the same PID file', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');

    const pidFile = join(testDir, 'daemon.pid');
    writeFileSync(pidFile, String(process.pid));

    const lifecycle = new LifecycleManager();
    await lifecycle.acquirePidFile(testDir);

    expect(process.exit).toHaveBeenCalledWith(1);

    lifecycle.destroy();
  });

  it('succeeds when no PID file exists', async () => {
    const { LifecycleManager } = await import('./lifecycle.js');
    const lifecycle = new LifecycleManager();

    await lifecycle.acquirePidFile(testDir);

    const pidFile = join(testDir, 'daemon.pid');
    expect(existsSync(pidFile)).toBe(true);

    lifecycle.destroy();
  });
});
