/**
 * Logger for the MCP server process.
 * CRITICAL: Must log to stderr since stdout is reserved for MCP JSON-RPC protocol.
 * Also logs to $SHIPYARD_STATE_DIR/server-debug.log for debugging.
 *
 * Log destinations:
 * - stderr: Visible in Claude Code's MCP server output (Settings > MCP > shipyard > output)
 * - file: $SHIPYARD_STATE_DIR/server-debug.log for post-mortem debugging
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import pino from "pino";
import { registryConfig } from "./config/env/registry.js";
import { serverConfig } from "./config/env/server.js";

const LOG_FILE = join(registryConfig.SHIPYARD_STATE_DIR, "server-debug.log");

/** Ensure log directory exists */
try {
	mkdirSync(dirname(LOG_FILE), { recursive: true });
} catch {
	/** Directory already exists or can't be created - continue anyway */
}

/*
 * Create logger that writes to BOTH stderr and a file
 * In development, use pino-pretty for stderr only (file gets raw JSON)
 */
const streams: pino.StreamEntry[] = [
	{ stream: pino.destination(2) },
	{ stream: pino.destination(LOG_FILE) },
];

export const logger = pino(
	{
		level: serverConfig.LOG_LEVEL,
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	pino.multistream(streams),
);
