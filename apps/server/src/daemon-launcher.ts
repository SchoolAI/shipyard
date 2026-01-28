/**
 * Daemon launcher - ensures the Shipyard daemon is running
 *
 * On first Claude Code session, spawns a detached daemon that survives
 * when the MCP server exits. This enables browser → agent triggering.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const DAEMON_PORTS = [56609, 49548];
const DAEMON_STARTUP_TIMEOUT_MS = 5000;
const DAEMON_POLL_INTERVAL_MS = 500;

function getDaemonPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const serverDistDir = dirname(currentFile);
  const serverDir = dirname(serverDistDir);
  const appsDir = dirname(serverDir);
  const daemonPath = join(appsDir, 'daemon', 'dist', 'index.js');
  return daemonPath;
}

/**
 * Checks if the daemon is running by trying its health check endpoint.
 * Returns the port if daemon is responding, null otherwise.
 */
async function isDaemonRunning(): Promise<number | null> {
  for (const port of DAEMON_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        logger.info({ port }, 'Daemon already running');
        return port;
      }
    } catch {
      // Not running on this port, try next
    }
  }
  return null;
}

/**
 * Spawns the daemon as a detached process.
 * The daemon survives when the parent (MCP server) exits.
 */
function spawnDetachedDaemon(): void {
  const daemonPath = getDaemonPath();

  logger.info({ daemonPath }, 'Spawning detached daemon');

  const daemon = spawn('node', [daemonPath], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });

  daemon.unref();

  logger.info({ pid: daemon.pid }, 'Daemon spawned');
}

/**
 * Waits for the daemon to become ready by polling its health check.
 * Returns true if daemon is ready within timeout, false otherwise.
 */
async function waitForDaemon(): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < DAEMON_STARTUP_TIMEOUT_MS) {
    const port = await isDaemonRunning();
    if (port) {
      logger.info({ port, elapsedMs: Date.now() - startTime }, 'Daemon ready');
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, DAEMON_POLL_INTERVAL_MS));
  }

  logger.warn(
    { timeoutMs: DAEMON_STARTUP_TIMEOUT_MS },
    'Daemon did not become ready within timeout'
  );
  return false;
}

/**
 * Ensures the daemon is running. If not, spawns it and waits for it to be ready.
 * Logs status but does not throw - daemon is optional for MCP functionality.
 */
export async function ensureDaemonRunning(): Promise<void> {
  /** Check if daemon is already running */
  const port = await isDaemonRunning();
  if (port) {
    logger.info({ port }, 'Daemon already running, skipping spawn');
    return;
  }

  /** Spawn detached daemon */
  try {
    spawnDetachedDaemon();

    /** Wait for daemon to be ready */
    const ready = await waitForDaemon();
    if (ready) {
      logger.info('Daemon bootstrap successful');
    } else {
      logger.warn(
        'Daemon may not have started - browser agent launching may not work. Check ~/.shipyard/daemon.lock'
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to spawn daemon - browser agent launching will not work');
  }
}
