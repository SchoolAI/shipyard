import * as pty from 'node-pty';
import { createChildLogger } from './logger.js';

export interface PtySpawnOptions {
  shell?: string;
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

export interface PtyManager {
  readonly pid: number | undefined;
  readonly alive: boolean;
  spawn(options: PtySpawnOptions): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (exitCode: number, signal?: number) => void): void;
  kill(): void;
  dispose(): void;
}

const KILL_TIMEOUT_MS = 5_000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export function createPtyManager(): PtyManager {
  const log = createChildLogger({ mode: 'pty' });

  let process: pty.IPty | null = null;
  let isAlive = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(exitCode: number, signal?: number) => void> = [];

  function getDefaultShell(): string {
    return globalThis.process.env.SHELL ?? '/bin/zsh';
  }

  function spawn(options: PtySpawnOptions): void {
    if (isAlive) {
      throw new Error('PTY already spawned. Call kill() or dispose() first.');
    }

    const shell = options.shell ?? getDefaultShell();
    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;

    const env: Record<string, string> = {};
    for (const [key, val] of Object.entries({ ...globalThis.process.env, ...options.env })) {
      if (val !== undefined) env[key] = val;
    }

    log.info({ shell, cwd: options.cwd, cols, rows }, 'Spawning PTY');

    try {
      process = pty.spawn(shell, ['--login'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: options.cwd,
        env,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg, shell }, 'Failed to spawn PTY');
      throw new Error(`Failed to spawn PTY: ${msg}`);
    }

    isAlive = true;

    process.onData((data) => {
      for (const cb of dataCallbacks) {
        cb(data);
      }
    });

    process.onExit(({ exitCode, signal }) => {
      log.info({ exitCode, signal, pid: process?.pid }, 'PTY exited');
      isAlive = false;
      clearKillTimer();
      for (const cb of exitCallbacks) {
        cb(exitCode, signal);
      }
    });

    log.info({ pid: process.pid }, 'PTY spawned');
  }

  function write(data: string): void {
    if (!process || !isAlive) {
      throw new Error('PTY is not running');
    }
    process.write(data);
  }

  function resize(cols: number, rows: number): void {
    if (!process || !isAlive) {
      throw new Error('PTY is not running');
    }
    process.resize(cols, rows);
  }

  function onData(callback: (data: string) => void): void {
    dataCallbacks.push(callback);
  }

  function onExit(callback: (exitCode: number, signal?: number) => void): void {
    exitCallbacks.push(callback);
  }

  function clearKillTimer(): void {
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = null;
    }
  }

  function kill(): void {
    if (!process || !isAlive) return;

    const proc = process;
    log.info({ pid: proc.pid }, 'Killing PTY (SIGTERM)');
    proc.kill('SIGTERM');

    killTimer = setTimeout(() => {
      log.warn({ pid: proc.pid }, 'PTY did not exit after SIGTERM, sending SIGKILL');
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, KILL_TIMEOUT_MS);
  }

  function dispose(): void {
    kill();
    dataCallbacks.length = 0;
    exitCallbacks.length = 0;
    process = null;
    isAlive = false;
  }

  return {
    get pid() {
      return process?.pid;
    },
    get alive() {
      return isAlive;
    },
    spawn,
    write,
    resize,
    onData,
    onExit,
    kill,
    dispose,
  };
}
