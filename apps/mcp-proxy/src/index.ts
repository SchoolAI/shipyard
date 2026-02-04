#!/usr/bin/env node
/**
 * MCP Proxy - Lightweight stdio-to-HTTP bridge for Claude Code.
 *
 * This proxy:
 * 1. Checks if daemon is running (health check)
 * 2. Starts daemon in background if not running
 * 3. Proxies MCP messages: stdio (Claude Code) <-> HTTP (daemon)
 *
 * This allows:
 * - Daemon to be a singleton (survives Claude Code restarts)
 * - Multiple Claude Code sessions to share one daemon
 * - User just configures .mcp.json once
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const DAEMON_URL = process.env.SHIPYARD_DAEMON_URL || 'http://localhost:4445';
const HEALTH_TIMEOUT_MS = 2000;
const DAEMON_STARTUP_WAIT_MS = 3000;
const MAX_STARTUP_RETRIES = 5;

/**
 * Check if daemon is healthy.
 */
async function isDaemonHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const response = await fetch(`${DAEMON_URL}/health`, {
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

/**
 * Resolve the path to the daemon executable.
 * Uses Node's require.resolve to find @shipyard/server in node_modules.
 */
function resolveDaemonPath(): string {
  const require = createRequire(import.meta.url);
  try {
    // Try to resolve the @shipyard/server package
    const serverPkg = require.resolve('@shipyard/server');
    // The package exports the main entry point, which is the daemon
    return serverPkg;
  } catch {
    // Fallback: assume sibling package in monorepo dev setup
    // This handles the case where we're running from source
    const __dirname = new URL('.', import.meta.url).pathname;
    return `${__dirname}../../server/dist/index.js`;
  }
}

/**
 * Start daemon in background.
 */
function startDaemon(): void {
  const daemonPath = resolveDaemonPath();

  // Spawn daemon detached so it survives this process
  const child = spawn('node', [daemonPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      // Ensure daemon doesn't inherit our stdio
      FORCE_COLOR: '0',
    },
  });

  // Unref so this process can exit
  child.unref();
}

/**
 * Wait for daemon to become healthy.
 */
async function waitForDaemon(): Promise<boolean> {
  for (let i = 0; i < MAX_STARTUP_RETRIES; i++) {
    if (await isDaemonHealthy()) {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, DAEMON_STARTUP_WAIT_MS / MAX_STARTUP_RETRIES)
    );
  }
  return false;
}

/**
 * Ensure daemon is running.
 */
async function ensureDaemon(): Promise<void> {
  if (await isDaemonHealthy()) {
    return;
  }

  // Start daemon
  startDaemon();

  // Wait for it to become healthy
  const healthy = await waitForDaemon();
  if (!healthy) {
    process.stderr.write('Failed to start daemon\n');
    process.exit(1);
  }
}

/**
 * Forward MCP request to daemon via HTTP.
 */
async function forwardRequest(request: string): Promise<string> {
  try {
    const response = await fetch(`${DAEMON_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: request,
    });

    if (!response.ok) {
      return JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: `Daemon returned ${response.status}: ${response.statusText}`,
        },
        id: null,
      });
    }

    // Handle both JSON and SSE responses
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // SSE stream - read all events and return last data
      const text = await response.text();
      const lines = text.split('\n');
      const dataLines = lines.filter((l) => l.startsWith('data: '));
      const lastDataLine = dataLines[dataLines.length - 1];
      if (lastDataLine === undefined) {
        return JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'No data in SSE response' },
          id: null,
        });
      }
      // Return the last data line (remove "data: " prefix)
      return lastDataLine.substring(6);
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: `Failed to reach daemon: ${message}`,
      },
      id: null,
    });
  }
}

/**
 * Main proxy loop.
 */
async function main(): Promise<void> {
  // Ensure daemon is running before we start proxying
  await ensureDaemon();

  // Read JSON-RPC messages from stdin, forward to daemon, write responses to stdout
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    const response = await forwardRequest(line);
    process.stdout.write(`${response}\n`);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : 'Proxy error';
  process.stderr.write(`Proxy error: ${message}\n`);
  process.exit(1);
});
