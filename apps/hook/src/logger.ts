/**
 * Logger for the hook process.
 * CRITICAL: Must log to stderr since stdout is reserved for hook JSON response.
 * Also logs to ~/.shipyard/hook-debug.log for debugging.
 *
 * Log destinations:
 * - stderr: Visible in Claude Code's hook output during execution
 * - file: ~/.shipyard/hook-debug.log for post-mortem debugging
 *
 * Expected warnings/errors in the log file:
 * - "No registry server found on any port" - Normal when MCP server isn't running
 * - "No WebSocket server available" - Same as above
 * - "Failed to read state file, starting fresh" - Normal on first run or after cleanup
 * - "WebSocket connection error/closed" - Normal during server restarts
 * - "Review timeout" - Normal during testing when no human reviews
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { serverConfig } from './config/env/server.js';

const LOG_FILE = join(homedir(), '.shipyard', 'hook-debug.log');

export const logger = pino(
  {
    level: serverConfig.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([{ stream: pino.destination(2) }, { stream: pino.destination(LOG_FILE) }])
);
