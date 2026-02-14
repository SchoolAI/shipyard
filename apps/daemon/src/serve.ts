import type { Env } from './env.js';
import { LifecycleManager } from './lifecycle.js';
import { createChildLogger, logger } from './logger.js';
import { createSignalingHandle } from './signaling-setup.js';

/**
 * Run the daemon in serve mode: connect to signaling, register capabilities,
 * and stay alive waiting for spawn-agent messages.
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
  const lifecycle = new LifecycleManager();

  const handle = await createSignalingHandle(env, log);
  if (!handle) {
    logger.error('SHIPYARD_SIGNALING_URL is required for serve mode');
    process.exit(1);
  }

  const { signaling, connection } = handle;

  connection.onStateChange((state) => {
    log.info({ state }, 'Connection state changed');
  });

  connection.onMessage((msg) => {
    if (msg.type === 'agents-list') {
      log.info({ count: msg.agents.length }, 'Agents online');
    }
  });

  connection.connect();

  log.info('Daemon running in serve mode, waiting for tasks...');

  lifecycle.onShutdown(async () => {
    log.info('Shutting down serve mode...');
    signaling.unregister();
    await new Promise((resolve) => setTimeout(resolve, 200));
    signaling.destroy();
    connection.disconnect();
  });

  /** Block forever. LifecycleManager handles SIGINT/SIGTERM and calls process.exit(0). */
  await new Promise<never>(() => {});
}
