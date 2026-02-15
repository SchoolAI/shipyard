import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockOnData = vi.fn();
const mockOnExit = vi.fn();
const mockWrite = vi.fn();
const mockResize = vi.fn();
const mockKill = vi.fn();

function createMockPty(pid = 1234) {
  return {
    pid,
    onData: mockOnData,
    onExit: mockOnExit,
    write: mockWrite,
    resize: mockResize,
    kill: mockKill,
  };
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => createMockPty()),
}));

import * as pty from 'node-pty';
import { createPtyManager } from './pty-manager.js';

const mockSpawn = vi.mocked(pty.spawn);

beforeEach(() => {
  vi.clearAllMocks();
  mockSpawn.mockReturnValue(createMockPty() as unknown as pty.IPty);
});

describe('createPtyManager', () => {
  describe('spawn', () => {
    it('spawns PTY with correct arguments', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/home/user/project', cols: 120, rows: 40 });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        ['--login'],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: '/home/user/project',
        })
      );
    });

    it('uses default cols and rows when not specified', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        ['--login'],
        expect.objectContaining({
          cols: 80,
          rows: 24,
        })
      );
    });

    it('uses custom shell when specified', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp', shell: '/bin/bash' });

      expect(mockSpawn).toHaveBeenCalledWith('/bin/bash', ['--login'], expect.any(Object));
    });

    it('merges custom env with process.env', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp', env: { CUSTOM_VAR: 'test' } });

      const callArgs = mockSpawn.mock.calls[0];
      const options = callArgs?.[2] as { env: Record<string, string> };
      expect(options.env.CUSTOM_VAR).toBe('test');
    });

    it('sets alive to true after spawn', () => {
      const manager = createPtyManager();
      expect(manager.alive).toBe(false);

      manager.spawn({ cwd: '/tmp' });
      expect(manager.alive).toBe(true);
    });

    it('exposes pid after spawn', () => {
      const manager = createPtyManager();
      expect(manager.pid).toBeUndefined();

      manager.spawn({ cwd: '/tmp' });
      expect(manager.pid).toBe(1234);
    });

    it('throws when spawning twice', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });

      expect(() => manager.spawn({ cwd: '/tmp' })).toThrow('PTY already spawned');
    });

    it('throws when node-pty spawn fails', () => {
      mockSpawn.mockImplementationOnce(() => {
        throw new Error('spawn ENOENT');
      });

      const manager = createPtyManager();
      expect(() => manager.spawn({ cwd: '/tmp' })).toThrow('Failed to spawn PTY: spawn ENOENT');
    });
  });

  describe('write', () => {
    it('forwards data to PTY stdin', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.write('ls -la\r');

      expect(mockWrite).toHaveBeenCalledWith('ls -la\r');
    });

    it('throws when writing to dead PTY', () => {
      const manager = createPtyManager();
      expect(() => manager.write('test')).toThrow('PTY is not running');
    });
  });

  describe('resize', () => {
    it('forwards resize to PTY', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.resize(200, 50);

      expect(mockResize).toHaveBeenCalledWith(200, 50);
    });

    it('throws when resizing dead PTY', () => {
      const manager = createPtyManager();
      expect(() => manager.resize(80, 24)).toThrow('PTY is not running');
    });
  });

  describe('onData', () => {
    it('wires callback to PTY output', () => {
      const manager = createPtyManager();
      const callback = vi.fn();
      manager.onData(callback);
      manager.spawn({ cwd: '/tmp' });

      const ptyDataHandler = mockOnData.mock.calls[0]?.[0] as (data: string) => void;
      ptyDataHandler('hello world');

      expect(callback).toHaveBeenCalledWith('hello world');
    });

    it('supports multiple data callbacks', () => {
      const manager = createPtyManager();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.onData(cb1);
      manager.onData(cb2);
      manager.spawn({ cwd: '/tmp' });

      const ptyDataHandler = mockOnData.mock.calls[0]?.[0] as (data: string) => void;
      ptyDataHandler('data');

      expect(cb1).toHaveBeenCalledWith('data');
      expect(cb2).toHaveBeenCalledWith('data');
    });
  });

  describe('onExit', () => {
    it('wires callback to PTY exit event', () => {
      const manager = createPtyManager();
      const callback = vi.fn();
      manager.onExit(callback);
      manager.spawn({ cwd: '/tmp' });

      const ptyExitHandler = mockOnExit.mock.calls[0]?.[0] as (e: {
        exitCode: number;
        signal: number;
      }) => void;
      ptyExitHandler({ exitCode: 0, signal: 0 });

      expect(callback).toHaveBeenCalledWith(0, 0);
    });

    it('sets alive to false on exit', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      expect(manager.alive).toBe(true);

      const ptyExitHandler = mockOnExit.mock.calls[0]?.[0] as (e: {
        exitCode: number;
        signal: number;
      }) => void;
      ptyExitHandler({ exitCode: 0, signal: 0 });

      expect(manager.alive).toBe(false);
    });
  });

  describe('kill', () => {
    it('sends SIGTERM to PTY', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.kill();

      expect(mockKill).toHaveBeenCalledWith('SIGTERM');
    });

    it('does nothing when PTY is not running', () => {
      const manager = createPtyManager();
      manager.kill();

      expect(mockKill).not.toHaveBeenCalled();
    });

    it('sends SIGKILL after timeout if PTY does not exit', () => {
      vi.useFakeTimers();

      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.kill();

      expect(mockKill).toHaveBeenCalledTimes(1);
      expect(mockKill).toHaveBeenCalledWith('SIGTERM');

      vi.advanceTimersByTime(5_000);

      expect(mockKill).toHaveBeenCalledTimes(2);
      expect(mockKill).toHaveBeenLastCalledWith('SIGKILL');

      vi.useRealTimers();
    });
  });

  describe('dispose', () => {
    it('kills PTY and cleans up', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.dispose();

      expect(mockKill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.alive).toBe(false);
      expect(manager.pid).toBeUndefined();
    });

    it('clears callbacks on dispose', () => {
      const manager = createPtyManager();
      const dataCb = vi.fn();
      const exitCb = vi.fn();
      manager.onData(dataCb);
      manager.onExit(exitCb);
      manager.spawn({ cwd: '/tmp' });
      manager.dispose();

      manager.spawn({ cwd: '/tmp' });
      const ptyDataHandler = mockOnData.mock.calls[1]?.[0] as (data: string) => void;
      ptyDataHandler('after-dispose');

      expect(dataCb).not.toHaveBeenCalled();
    });

    it('is safe to call multiple times', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.dispose();
      manager.dispose();

      expect(mockKill).toHaveBeenCalledTimes(1);
    });

    it('allows re-spawn after dispose', () => {
      const manager = createPtyManager();
      manager.spawn({ cwd: '/tmp' });
      manager.dispose();

      expect(() => manager.spawn({ cwd: '/other' })).not.toThrow();
      expect(manager.alive).toBe(true);
    });
  });
});
