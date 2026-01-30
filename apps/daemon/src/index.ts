/**
 * Shipyard Agent Launcher Daemon
 *
 * Lightweight daemon that runs on localhost and enables the browser
 * to trigger local agent sessions (Claude Code, etc.)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { daemonConfig } from './config.js';
import { getStateDir, releaseDaemonLock, tryAcquireDaemonLock } from './lock-manager.js';
import { logger } from './logger.js';
import { ensureShipyardPlugin } from './plugin-setup.js';
import { startWebSocketServer } from './websocket-server.js';

async function main(): Promise<void> {
  logger.info({ port: daemonConfig.DAEMON_PORT, stateDir: daemonConfig.SHIPYARD_STATE_DIR }, 'Shipyard daemon starting...');

  const shipyardDir = getStateDir();
  if (!existsSync(shipyardDir)) {
    mkdirSync(shipyardDir, { recursive: true });
  }

  ensureShipyardPlugin();

  const acquired = await tryAcquireDaemonLock();
  if (!acquired) {
    logger.error('Failed to acquire daemon lock - another instance may be running');
    process.exit(1);
  }

  const port = await startWebSocketServer();
  if (!port) {
    await releaseDaemonLock();
    logger.error('Failed to start WebSocket server - all ports in use');
    process.exit(1);
  }

  logger.info({ port }, 'Daemon running');
  logger.info('Ready to accept agent launch requests');
}

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await releaseDaemonLock();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await releaseDaemonLock();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  logger.error({ err }, 'Uncaught exception');
  await releaseDaemonLock();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  await releaseDaemonLock();
  process.exit(1);
});

main().catch(async (err) => {
  logger.error({ err }, 'Failed to start daemon');
  await releaseDaemonLock();
  process.exit(1);
});
