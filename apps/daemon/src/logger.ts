/**
 * Logger for the daemon process.
 * CRITICAL: Must log to stderr since stdout may be reserved for process output.
 * Also logs to $SHIPYARD_STATE_DIR/daemon-debug.log for debugging.
 *
 * Log destinations:
 * - stderr: Visible in terminal when running daemon
 * - file: $SHIPYARD_STATE_DIR/daemon-debug.log for post-mortem debugging
 *
 * Expected log messages:
 * - "Shipyard daemon starting..." - Normal startup
 * - "Acquired daemon lock" - Successfully obtained singleton lock
 * - "WebSocket server listening" - Server ready for connections
 * - "Spawning Claude Code" - Agent launch in progress
 *
 * Note: Uses process.env directly (not daemonConfig) to avoid circular dependency.
 * The config module imports logger, so logger must not import config.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';

/** Read state dir from env directly to avoid circular dependency with config.ts */
const LOG_DIR = process.env.SHIPYARD_STATE_DIR || join(homedir(), '.shipyard');
const LOG_FILE = join(LOG_DIR, 'daemon-debug.log');

/** Log level from env, default to info */
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/** Export for use in error messages */
export const DAEMON_LOG_FILE = LOG_FILE;

/**
 * Skip file logging in test environment to avoid filesystem side effects.
 * This prevents ENOENT errors in CI where ~/.shipyard doesn't exist.
 */
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
if (!isTest && !existsSync(LOG_DIR)) {
	try {
		mkdirSync(LOG_DIR, { recursive: true });
	} catch (err) {
		console.error(`[shipyard-daemon] Warning: Failed to create log directory ${LOG_DIR}, file logging disabled`);
	}
}

const streams = isTest
	? [{ stream: pino.destination(2) }]
	: [{ stream: pino.destination(2) }, { stream: pino.destination(LOG_FILE) }];

export const logger = pino(
	{
		level: LOG_LEVEL,
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	pino.multistream(streams)
);
