import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { createKeepAwakeStrategy, KeepAwakeManager } from './keep-awake.js';

const mockSpawn = vi.mocked(spawn);

interface MockChild extends EventEmitter {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
}

function createMockChild(pid = 1234): MockChild {
  // biome-ignore lint/complexity/noBannedTypes: test mock event handler map
  const handlers = new Map<string, Function>();
  return {
    pid,
    kill: vi.fn(),
    unref: vi.fn(),
    // biome-ignore lint/complexity/noBannedTypes: test mock event handler
    on(event: string, handler: Function) {
      handlers.set(event, handler);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.(...args);
      return true;
    },
    removeAllListeners() {
      handlers.clear();
      return this;
    },
  } as unknown as MockChild;
}

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};

describe('createKeepAwakeStrategy', () => {
  it('returns strategy for darwin', () => {
    expect(createKeepAwakeStrategy('darwin')).not.toBeNull();
  });

  it('returns strategy for linux', () => {
    expect(createKeepAwakeStrategy('linux')).not.toBeNull();
  });

  it('returns strategy for win32', () => {
    expect(createKeepAwakeStrategy('win32')).not.toBeNull();
  });

  it('returns null for unsupported platform', () => {
    expect(createKeepAwakeStrategy('freebsd' as NodeJS.Platform)).toBeNull();
  });

  it('darwin strategy spawns caffeinate', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const strategy = createKeepAwakeStrategy('darwin')!;
    strategy.spawn();

    expect(mockSpawn).toHaveBeenCalledWith(
      'caffeinate',
      ['-i'],
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'ignore'] })
    );
  });

  it('linux strategy spawns systemd-inhibit', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const strategy = createKeepAwakeStrategy('linux')!;
    strategy.spawn();

    expect(mockSpawn).toHaveBeenCalledWith(
      'systemd-inhibit',
      expect.arrayContaining(['--what=idle']),
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'ignore'] })
    );
  });

  it('win32 strategy spawns powershell', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const strategy = createKeepAwakeStrategy('win32')!;
    strategy.spawn();

    expect(mockSpawn).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-NoProfile']),
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'ignore'] })
    );
  });
});

describe('KeepAwakeManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts process when enabled with active tasks', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, true);

    expect(mockSpawn).toHaveBeenCalled();
    expect(child.unref).toHaveBeenCalled();
    expect(manager.running).toBe(true);
  });

  it('does not start when disabled', () => {
    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(false, true);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(manager.running).toBe(false);
  });

  it('does not start when no active tasks', () => {
    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, false);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(manager.running).toBe(false);
  });

  it('stops process when disabled', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, true);
    manager.update(false, true);

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.running).toBe(false);
  });

  it('stops process when no more active tasks', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, true);
    manager.update(true, false);

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.running).toBe(false);
  });

  it('shutdown kills process', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, true);
    manager.shutdown();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.running).toBe(false);
  });

  it('restarts on unexpected exit while should be running', () => {
    const child1 = createMockChild(1001);
    const child2 = createMockChild(1002);
    mockSpawn.mockReturnValueOnce(child1 as never).mockReturnValueOnce(child2 as never);

    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, true);
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    child1.emit('exit', 1, null);
    vi.advanceTimersByTime(1_000);

    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(manager.running).toBe(true);
  });

  it('does not restart on exit after shutdown', () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child as never);

    const manager = new KeepAwakeManager(mockLog as never);
    manager.update(true, true);
    manager.shutdown();
    mockSpawn.mockClear();

    child.emit('exit', 0, null);

    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
