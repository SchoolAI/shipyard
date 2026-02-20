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
  // biome-ignore lint/suspicious/noExplicitAny: process event handlers have heterogeneous signatures
  #signalHandlers: { signal: string; handler: (...args: any[]) => void }[] = [];
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

    const exceptionHandler = (error: Error) => {
      try {
        logger.error({ error }, 'Uncaught exception — initiating shutdown');
      } catch {}
      void this.#shutdown('uncaughtException');
    };

    const rejectionHandler = (reason: unknown) => {
      try {
        logger.error({ reason }, 'Unhandled rejection — initiating shutdown');
      } catch {}
      void this.#shutdown('unhandledRejection');
    };

    process.on('uncaughtException', exceptionHandler);
    process.on('unhandledRejection', rejectionHandler);
    this.#signalHandlers.push(
      { signal: 'uncaughtException', handler: exceptionHandler },
      { signal: 'unhandledRejection', handler: rejectionHandler }
    );
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

    const HARD_KILL_MS = 15_000;
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, HARD_KILL_MS);
    forceExit.unref();

    for (const controller of this.#abortControllers) {
      controller.abort();
    }
    this.#abortControllers.clear();

    const CALLBACK_TIMEOUT_MS = 5_000;
    for (const callback of this.#shutdownCallbacks) {
      let timeoutId: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          callback(),
          new Promise<void>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('Shutdown callback timed out')),
              CALLBACK_TIMEOUT_MS
            );
          }),
        ]).finally(() => clearTimeout(timeoutId));
      } catch (error) {
        logger.error({ error }, 'Error during shutdown callback');
      }
    }

    await this.#removePidFile();

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(0);
  }
}
