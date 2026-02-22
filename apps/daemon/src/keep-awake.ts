import { type ChildProcess, spawn } from 'node:child_process';
import type { Logger } from 'pino';

export interface KeepAwakeStrategy {
  spawn(): ChildProcess;
}

const darwinStrategy: KeepAwakeStrategy = {
  spawn: () => spawn('caffeinate', ['-i'], { stdio: ['ignore', 'ignore', 'ignore'] }),
};

const linuxStrategy: KeepAwakeStrategy = {
  spawn: () =>
    spawn(
      'systemd-inhibit',
      ['--what=idle', '--why=Shipyard agent tasks running', 'sleep', 'infinity'],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    ),
};

const win32Strategy: KeepAwakeStrategy = {
  spawn: () =>
    spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '[System.Runtime.InteropServices.Marshal]::SetThreadExecutionState(0x80000001); Start-Sleep -Seconds 2147483',
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    ),
};

export function createKeepAwakeStrategy(
  platform: NodeJS.Platform = process.platform
): KeepAwakeStrategy | null {
  switch (platform) {
    case 'darwin':
      return darwinStrategy;
    case 'linux':
      return linuxStrategy;
    case 'win32':
      return win32Strategy;
    default:
      return null;
  }
}

const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_MS = 1_000;

export class KeepAwakeManager {
  #child: ChildProcess | null = null;
  #strategy: KeepAwakeStrategy | null;
  #shouldBeRunning = false;
  #restartAttempts = 0;
  #log: Logger;

  constructor(log: Logger) {
    this.#strategy = createKeepAwakeStrategy();
    this.#log = log;
    if (!this.#strategy) {
      log.info({ platform: process.platform }, 'Keep-awake not supported on this platform');
    }
  }

  get running(): boolean {
    return this.#child !== null;
  }

  update(enabled: boolean, hasActiveTasks: boolean): void {
    const shouldRun = enabled && hasActiveTasks;
    this.#shouldBeRunning = shouldRun;
    this.#restartAttempts = 0;

    if (shouldRun && !this.#child) {
      this.#start();
    } else if (!shouldRun && this.#child) {
      this.#stop();
    }
  }

  shutdown(): void {
    this.#shouldBeRunning = false;
    this.#stop();
  }

  #start(): void {
    if (!this.#strategy || this.#child) return;

    try {
      const child = this.#strategy.spawn();
      this.#child = child;
      child.unref();

      child.on('exit', (code, signal) => {
        if (this.#child !== child) return;
        this.#log.info({ code, signal }, 'Keep-awake process exited');
        this.#child = null;
        this.#scheduleRestart();
      });

      child.on('error', (err) => {
        if (this.#child !== child) return;
        this.#log.warn({ err: err.message }, 'Keep-awake process error');
        this.#child = null;
        this.#scheduleRestart();
      });

      this.#log.info({ pid: child.pid, platform: process.platform }, 'Keep-awake started');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.#log.warn({ err: msg }, 'Failed to start keep-awake process');
      this.#child = null;
    }
  }

  #scheduleRestart(): void {
    if (!this.#shouldBeRunning) return;
    this.#restartAttempts++;
    if (this.#restartAttempts > MAX_RESTART_ATTEMPTS) {
      this.#log.warn(
        { attempts: this.#restartAttempts },
        'Keep-awake exceeded max restart attempts, giving up'
      );
      return;
    }
    const delay = RESTART_BACKOFF_MS * 2 ** (this.#restartAttempts - 1);
    this.#log.info(
      { attempt: this.#restartAttempts, delayMs: delay },
      'Scheduling keep-awake restart'
    );
    const timer = setTimeout(() => {
      if (this.#shouldBeRunning && !this.#child) {
        this.#start();
      }
    }, delay);
    timer.unref();
  }

  #stop(): void {
    if (!this.#child) return;
    const pid = this.#child.pid;
    try {
      this.#child.kill('SIGTERM');
    } catch {}
    this.#child = null;
    this.#log.info({ pid }, 'Keep-awake stopped');
  }
}
