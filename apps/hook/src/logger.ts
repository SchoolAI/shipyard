/**
 * Logger for the hook process.
 * CRITICAL: Must log to stderr since stdout is reserved for hook JSON response.
 * Also logs to $SHIPYARD_STATE_DIR/hook-debug.log for debugging.
 *
 * Log destinations:
 * - stderr: Visible in Claude Code's hook output during execution
 * - file: $SHIPYARD_STATE_DIR/hook-debug.log for post-mortem debugging
 *
 * Expected warnings/errors in the log file:
 * - "No registry server found on any port" - Normal when MCP server isn't running
 * - "No WebSocket server available" - Same as above
 * - "Failed to read state file, starting fresh" - Normal on first run or after cleanup
 * - "WebSocket connection error/closed" - Normal during server restarts
 * - "Review timeout" - Normal during testing when no human reviews
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { registryConfig } from './config/env/registry.js';
import { serverConfig } from './config/env/server.js';

const LOG_DIR = registryConfig.SHIPYARD_STATE_DIR;
const LOG_FILE = join(LOG_DIR, 'hook-debug.log');

/** Export for use in error messages */
export const HOOK_LOG_FILE = LOG_FILE;

/**
 * Skip file logging in test environment to avoid filesystem side effects.
 * This prevents ENOENT errors in CI where ~/.shipyard doesn't exist.
 */
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
if (!isTest && !existsSync(LOG_DIR)) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* Directory creation failed - continue without file logging */
  }
}

const streams = isTest
  ? [{ stream: pino.destination(2) }]
  : [{ stream: pino.destination(2) }, { stream: pino.destination(LOG_FILE) }];

export const logger = pino(
  {
    level: serverConfig.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams)
);
