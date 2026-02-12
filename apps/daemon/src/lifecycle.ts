import { logger } from './logger.js';

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

  constructor() {
    process.on('SIGTERM', () => void this.#shutdown('SIGTERM'));
    process.on('SIGINT', () => void this.#shutdown('SIGINT'));
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

    logger.info('Shutdown complete');
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(0);
  }
}
