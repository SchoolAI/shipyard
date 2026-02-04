/**
 * Logger for the MCP server process.
 * CRITICAL: Must log to stderr since stdout is reserved for MCP JSON-RPC protocol.
 * Also logs to $SHIPYARD_STATE_DIR/server-debug.log for debugging.
 *
 * Log destinations:
 * - stderr: Visible in Claude Code's MCP server output (Settings > MCP > shipyard > output)
 * - file: $SHIPYARD_STATE_DIR/server-debug.log for post-mortem debugging
 *
 * Ported from apps/server-legacy/src/logger.ts
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pino from 'pino';
import type { Env } from '../env.js';
import { getStateDir } from './paths.js';

/**
 * Create a configured logger instance.
 * Writes to both stderr and a log file.
 */
export function createLogger(env: Env): pino.Logger {
  const logFile = join(getStateDir(), 'server-debug.log');

  /** Ensure log directory exists */
  try {
    mkdirSync(dirname(logFile), { recursive: true });
  } catch {
    /** Directory already exists or can't be created - continue anyway */
  }

  const streams: pino.StreamEntry[] = [
    { stream: pino.destination(2) },
    { stream: pino.destination(logFile) },
  ];

  return pino(
    {
      level: env.LOG_LEVEL,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams)
  );
}

/** Default logger instance (initialized later) */
let defaultLogger: pino.Logger | null = null;

/**
 * Initialize the default logger.
 */
export function initLogger(env: Env): void {
  defaultLogger = createLogger(env);
}

/**
 * Get the default logger.
 * Throws if not initialized.
 */
export function getLogger(): pino.Logger {
  if (!defaultLogger) {
    throw new Error('Logger not initialized. Call initLogger first.');
  }
  return defaultLogger;
}

/**
 * Lazy logger proxy for modules that import logger before initialization.
 * Use getLogger() when possible for explicit control.
 */
/* eslint-disable no-restricted-syntax */
export const logger: pino.Logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    const actualLogger = getLogger();
    const value = actualLogger[prop as keyof pino.Logger];
    if (typeof value === 'function') {
      return value.bind(actualLogger);
    }
    return value;
  },
});
/* eslint-enable no-restricted-syntax */
