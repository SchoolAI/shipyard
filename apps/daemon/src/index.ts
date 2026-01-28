/**
 * Shipyard Agent Launcher Daemon
 *
 * Lightweight daemon that runs on localhost and enables the browser
 * to trigger local agent sessions (Claude Code, etc.)
 */

import { releaseDaemonLock, tryAcquireDaemonLock } from './lock-manager.js';
import { startWebSocketServer } from './websocket-server.js';

async function main(): Promise<void> {
  console.log('Shipyard daemon starting...');

  const acquired = await tryAcquireDaemonLock();
  if (!acquired) {
    console.error('Failed to acquire daemon lock - another instance may be running');
    process.exit(1);
  }

  const port = await startWebSocketServer();
  if (!port) {
    await releaseDaemonLock();
    console.error('Failed to start WebSocket server - all ports in use');
    process.exit(1);
  }

  console.log(`Daemon running on port ${port}`);
  console.log('Ready to accept agent launch requests');
}

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  await releaseDaemonLock();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  await releaseDaemonLock();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  await releaseDaemonLock();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled rejection:', reason);
  await releaseDaemonLock();
  process.exit(1);
});

main().catch(async (err) => {
  console.error('Failed to start daemon:', err);
  await releaseDaemonLock();
  process.exit(1);
});
