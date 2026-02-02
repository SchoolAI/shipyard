/**
 * Pino logger configuration.
 */

import pino from "pino";
import type { Env } from "../env.js";

/**
 * Create a configured logger instance.
 */
export function createLogger(env: Env): pino.Logger {
	return pino({
		level: env.LOG_LEVEL,
		transport:
			process.env.NODE_ENV !== "production"
				? { target: "pino-pretty", options: { colorize: true } }
				: undefined,
	});
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
		throw new Error("Logger not initialized. Call initLogger first.");
	}
	return defaultLogger;
}
