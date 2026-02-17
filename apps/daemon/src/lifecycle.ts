import { unlinkSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

/**
 * Manages graceful shutdown for the daemon process.
 *
 * Tracks active AbortControllers so all in-flight agent sessions can be
 * cancelled on SIGTERM/SIGINT. Runs registered shutdown callbacks
 * (e.g., repo.shutdown()) before exiting.
 */
export class LifecycleManager {
  #abortControllers = new Set<AbortController>();
  #shutdownCallbacks: Array<() => Promise<void>> = [];
  #isShuttingDown = false;
  #signalHandlers: { signal: string; handler: () => void }[] = [];
  #pidFilePath: string | null = null;

  constructor() {
    const termHandler = () => void this.#shutdown('SIGTERM');
    const intHandler = () => void this.#shutdown('SIGINT');
    process.on('SIGTERM', termHandler);
    process.on('SIGINT', intHandler);
    this.#signalHandlers = [
      { signal: 'SIGTERM', handler: termHandler },
      { signal: 'SIGINT', handler: intHandler },
    ];
  }

  destroy(): void {
    for (const { signal, handler } of this.#signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.#signalHandlers = [];
    this.#isShuttingDown = false;
    this.#shutdownCallbacks = [];
    this.#abortControllers.clear();
    this.#removePidFileSync();
  }

  async acquirePidFile(shipyardHome: string): Promise<void> {
    const pidFilePath = join(shipyardHome, 'daemon.pid');

    try {
      const existing = await readFile(pidFilePath, 'utf-8');
      const pid = Number.parseInt(existing.trim(), 10);
      if (!Number.isNaN(pid) && isProcessAlive(pid)) {
        logger.error(
          { pid, pidFile: pidFilePath },
          'Another daemon is already running. Stop it first or remove the stale PID file.'
        );
        process.exit(1);
      }
      logger.info({ stalePid: pid, pidFile: pidFilePath }, 'Removing stale PID file');
    } catch (err: unknown) {
      if (!isEnoent(err)) throw err;
    }

    await writeFile(pidFilePath, String(process.pid), { mode: 0o644 });
    this.#pidFilePath = pidFilePath;
    logger.info({ pid: process.pid, pidFile: pidFilePath }, 'PID file acquired');
  }

  #removePidFileSync(): void {
    if (!this.#pidFilePath) return;
    try {
      unlinkSync(this.#pidFilePath);
    } catch {}
    this.#pidFilePath = null;
  }

  async #removePidFile(): Promise<void> {
    if (!this.#pidFilePath) return;
    try {
      await unlink(this.#pidFilePath);
    } catch {}
    this.#pidFilePath = null;
  }

  /**
   * Create an AbortController tracked by this manager.
   * On shutdown, all tracked controllers are aborted.
   * Controllers self-remove from tracking when aborted.
   */
  createAbortController(): AbortController {
    const controller = new AbortController();
    this.#abortControllers.add(controller);
    controller.signal.addEventListener('abort', () => {
      this.#abortControllers.delete(controller);
    });
    return controller;
  }

  /**
   * Register a callback to run during shutdown (e.g., repo.shutdown()).
   * Callbacks run sequentially in registration order.
   */
  onShutdown(callback: () => Promise<void>): void {
    this.#shutdownCallbacks.push(callback);
  }

  async #shutdown(signal: string): Promise<void> {
    if (this.#isShuttingDown) return;
    this.#isShuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received');

    for (const controller of this.#abortControllers) {
      controller.abort();
    }
    this.#abortControllers.clear();

    for (const callback of this.#shutdownCallbacks) {
      try {
        await callback();
      } catch (error) {
        logger.error({ error }, 'Error during shutdown callback');
      }
    }

    await this.#removePidFile();

    logger.info('Shutdown complete');
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(0);
  }
}
