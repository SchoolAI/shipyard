#!/usr/bin/env node

import { mkdirSync } from 'node:fs';

import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { initSpawner } from './agents/spawner.js';
import { type Env, parseEnv } from './env.js';
import { initGitHubClient } from './http/helpers/github.js';
import { type AppContext, createApp } from './http/routes/index.js';
import {
  startSpawnRequestCleanup,
  stopAllGitSyncs,
  stopSpawnRequestCleanup,
} from './loro/handlers.js';
import { createRepo, resetRepo } from './loro/repo.js';
import { startTaskWatcher } from './loro/task-watcher.js';
import { initMcpServer, resetMcpServer } from './mcp/index.js';
import { isLocked, releaseLock, tryAcquireLock } from './utils/daemon-lock.js';
import { getLogger, initLogger } from './utils/logger.js';
import { getStateDir } from './utils/paths.js';

/**
 * Check if daemon is already running and healthy.
 */
async function isDaemonHealthy(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) {
      const data = (await response.json()) as { status?: string };
      return data.status === 'ok';
    }
    return false;
  } catch {
    return false;
  }
}

async function runDaemon(env: Env): Promise<void> {
  const log = getLogger();
  const port = env.PORT;

  log.info({ port, stateDir: getStateDir() }, 'Starting shipyard daemon');

  mkdirSync(getStateDir(), { recursive: true });

  // Check if daemon is already running and healthy
  if (await isDaemonHealthy(port)) {
    log.info('Healthy daemon already running, exiting');
    process.exit(0);
  }

  // Check lock file (daemon might be starting or stuck)
  if (isLocked()) {
    // Lock exists but health check failed - might be starting up, wait and retry
    log.info('Lock exists, waiting for daemon to become healthy...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (await isDaemonHealthy(port)) {
      log.info('Daemon became healthy, exiting');
      process.exit(0);
    }

    // Still not healthy - stale lock, try to take over
    log.warn('Daemon not responding, assuming stale lock');
  }

  const acquired = await tryAcquireLock();
  if (!acquired) {
    // Another process grabbed the lock while we were checking
    // Try health check one more time
    if (await isDaemonHealthy(port)) {
      log.info('Another daemon started, exiting');
      process.exit(0);
    }
    log.error('Failed to acquire daemon lock and no healthy daemon found');
    process.exit(1);
  }

  log.info('Daemon lock acquired');

  const startTime = Date.now();

  initGitHubClient(env);

  initSpawner(env);
  log.info('Agent spawner initialized');

  startSpawnRequestCleanup();
  log.info('Spawn request cleanup started');

  const wss = new WebSocketServer({ noServer: true });

  createRepo(wss);
  log.info('Loro Repo created with adapters');

  const stopWatcher = startTaskWatcher();
  log.info('Task watcher started - monitoring spawn events');

  initMcpServer();
  log.info('MCP server initialized on /mcp endpoint');

  const appContext: AppContext = {
    health: { startTime },
    github: {
      getClient: () => null,
      parseRepo: (_planId: string) => null,
    },
  };
  const app = createApp(appContext);

  const server = serve({
    fetch: app.fetch,
    port,
  });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  log.info({ port }, 'HTTP server started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Received shutdown signal');

    stopWatcher();
    log.debug('Task watcher stopped');

    stopAllGitSyncs();
    log.debug('All git syncs stopped');

    stopSpawnRequestCleanup();
    log.debug('Spawn request cleanup stopped');

    // Wait for HTTP server to fully close (releases port)
    await new Promise<void>((resolve) => {
      server.close(() => {
        log.debug('HTTP server closed');
        resolve();
      });
    });

    // Wait for WebSocket server to fully close
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => {
        if (err) {
          log.warn({ err }, 'Error closing WebSocket server');
          reject(err);
        } else {
          log.debug('WebSocket server closed');
          resolve();
        }
      });
    }).catch(() => {
      // Continue shutdown even if WS close fails
    });

    try {
      resetRepo();
      log.debug('Loro repo reset');
    } catch (err) {
      log.warn({ err }, 'Error resetting Loro repo during shutdown');
    }

    resetMcpServer();
    log.debug('MCP server reset');

    // Now it's safe to release the lock - port is guaranteed to be released
    await releaseLock();

    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', async (err) => {
    log.error({ err }, 'Uncaught exception');
    try {
      stopWatcher();
    } catch {}
    stopAllGitSyncs();
    stopSpawnRequestCleanup();

    // Close servers before releasing lock
    try {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    } catch {}

    try {
      resetRepo();
    } catch {}
    resetMcpServer();
    await releaseLock();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    log.error({ reason }, 'Unhandled rejection');
    try {
      stopWatcher();
    } catch {}
    stopAllGitSyncs();
    stopSpawnRequestCleanup();

    // Close servers before releasing lock
    try {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    } catch {}

    try {
      resetRepo();
    } catch {}
    resetMcpServer();
    await releaseLock();
    process.exit(1);
  });

  log.info({ port }, 'Daemon running');
  log.info({ endpoints: ['/health', '/ws', '/mcp'] }, 'Available endpoints');
}

export async function main(): Promise<void> {
  const env = parseEnv();

  initLogger(env);
  const log = getLogger();

  log.info('Shipyard daemon starting');

  await runDaemon(env);
}

main().catch((err) => {
  const log = getLogger();
  log.fatal({ err }, 'Fatal error');
  process.exit(1);
});
