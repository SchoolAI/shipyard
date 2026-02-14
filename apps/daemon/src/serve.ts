import { hostname } from 'node:os';
import { PersonalRoomConnection } from '@shipyard/session';
import { detectCapabilities } from './capabilities.js';
import type { Env } from './env.js';
import { LifecycleManager } from './lifecycle.js';
import { createChildLogger, logger } from './logger.js';
import { createDaemonSignaling } from './signaling.js';

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

  const machineId = env.SHIPYARD_MACHINE_ID ?? hostname();
  const machineName = env.SHIPYARD_MACHINE_NAME ?? hostname();
  const wsUrl = new URL(env.SHIPYARD_SIGNALING_URL);
  if (env.SHIPYARD_USER_TOKEN) {
    wsUrl.searchParams.set('token', env.SHIPYARD_USER_TOKEN);
  }

  const capabilities = await detectCapabilities({ cwd: process.cwd() });
  log.info(
    { models: capabilities.models.length, environments: capabilities.environments.length },
    'Detected machine capabilities'
  );

  const connection = new PersonalRoomConnection({ url: wsUrl.toString() });
  const signaling = createDaemonSignaling({
    connection,
    machineId,
    machineName,
    agentType: 'daemon',
    capabilities,
  });

  connection.onStateChange((state) => {
    log.info({ state }, 'Connection state changed');
    if (state === 'connected') {
      signaling.register();
      log.info({ machineId, machineName }, 'Registered with signaling server');
    }
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
    signaling.destroy();
    connection.disconnect();
  });

  // Block forever. LifecycleManager handles SIGINT/SIGTERM and calls process.exit(0).
  await new Promise<never>(() => {});
}
