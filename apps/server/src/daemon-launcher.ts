/**
 * Daemon launcher - ensures the Shipyard daemon is running
 *
 * On first Claude Code session, spawns a detached daemon that survives
 * when the MCP server exits. This enables browser → agent triggering.
 *
 * Supports per-worktree daemons via DAEMON_PORT and SHIPYARD_STATE_DIR env vars.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/** Get daemon port from env, default to 56609 for main worktree */
const DAEMON_PORT = process.env.DAEMON_PORT ? Number.parseInt(process.env.DAEMON_PORT, 10) : 56609;

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
  try {
    const res = await fetch(`http://localhost:${DAEMON_PORT}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      logger.info({ port: DAEMON_PORT }, 'Daemon already running');
      return DAEMON_PORT;
    }
  } catch {}
  return null;
}

/**
 * Spawns the daemon as a detached process.
 * The daemon survives when the parent (MCP server) exits.
 * Passes through worktree-specific env vars so daemon uses correct ports/paths.
 */
function spawnDetachedDaemon(): void {
  const daemonPath = getDaemonPath();

  logger.info({ daemonPath, port: DAEMON_PORT }, 'Spawning detached daemon');

  const daemon = spawn('node', [daemonPath], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: {
      ...process.env,
      DAEMON_PORT: String(DAEMON_PORT),
      ...(process.env.SHIPYARD_STATE_DIR && { SHIPYARD_STATE_DIR: process.env.SHIPYARD_STATE_DIR }),
      ...(process.env.SHIPYARD_WEB_URL && { SHIPYARD_WEB_URL: process.env.SHIPYARD_WEB_URL }),
      ...(process.env.LOG_LEVEL && { LOG_LEVEL: process.env.LOG_LEVEL }),
    },
  });

  daemon.unref();

  logger.info({ pid: daemon.pid, port: DAEMON_PORT }, 'Daemon spawned');
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
 * Checks if auto-start is configured by attempting to import and call the function.
 * Returns false if the import fails (daemon not built yet).
 */
async function isAutoStartConfigured(): Promise<boolean> {
  try {
    const module: unknown = await import('../../daemon/dist/auto-start.js');
    if (
      module &&
      typeof module === 'object' &&
      'isAutoStartConfigured' in module &&
      typeof module.isAutoStartConfigured === 'function'
    ) {
      const result = await module.isAutoStartConfigured();
      return typeof result === 'boolean' ? result : false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sets up auto-start configuration by attempting to import and call the function.
 * Returns false if the import fails (daemon not built yet).
 */
async function setupAutoStart(): Promise<boolean> {
  try {
    const module: unknown = await import('../../daemon/dist/auto-start.js');
    if (
      module &&
      typeof module === 'object' &&
      'setupAutoStart' in module &&
      typeof module.setupAutoStart === 'function'
    ) {
      const result = await module.setupAutoStart();
      return typeof result === 'boolean' ? result : false;
    }
    return false;
  } catch (err) {
    logger.warn({ err }, 'Failed to import auto-start module - daemon may not be built yet');
    return false;
  }
}

/**
 * Ensures the daemon is running. If not, spawns it and waits for it to be ready.
 * Logs status but does not throw - daemon is optional for MCP functionality.
 */
export async function ensureDaemonRunning(): Promise<void> {
  const port = await isDaemonRunning();
  if (port) {
    logger.info({ port }, 'Daemon already running, skipping spawn');
    return;
  }

  const isConfigured = await isAutoStartConfigured();
  logger.info({ isConfigured }, 'Checking auto-start configuration');

  if (!isConfigured) {
    logger.info('Setting up daemon auto-start on boot');
    const success = await setupAutoStart();
    if (success) {
      logger.info('Auto-start configured successfully - daemon will survive reboots');
    } else {
      logger.warn('Failed to configure auto-start, falling back to manual spawn');
    }
  } else {
    logger.info('Auto-start already configured - daemon will auto-start on boot');
  }

  try {
    spawnDetachedDaemon();

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
