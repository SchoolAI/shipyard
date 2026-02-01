/**
 * Lightweight logger for Cloudflare Workers.
 *
 * Uses console methods internally (pino not available in Workers).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export class Logger {
	private level: number;
	private context: Record<string, unknown>;

	constructor(level: LogLevel = "info", context: Record<string, unknown> = {}) {
		this.level = LOG_LEVELS[level];
		this.context = context;
	}

	debug(message: string, data?: Record<string, unknown>): void {
		if (this.level <= LOG_LEVELS.debug) {
			this.log("debug", message, data);
		}
	}

	info(message: string, data?: Record<string, unknown>): void {
		if (this.level <= LOG_LEVELS.info) {
			this.log("info", message, data);
		}
	}

	warn(message: string, data?: Record<string, unknown>): void {
		if (this.level <= LOG_LEVELS.warn) {
			this.log("warn", message, data);
		}
	}

	error(message: string, data?: Record<string, unknown>): void {
		if (this.level <= LOG_LEVELS.error) {
			this.log("error", message, data);
		}
	}

	/**
	 * Create a child logger with additional context.
	 */
	child(context: Record<string, unknown>): Logger {
		const childLogger = new Logger(this.getLevelName(), {
			...this.context,
			...context,
		});
		return childLogger;
	}

	private log(
		level: LogLevel,
		message: string,
		data?: Record<string, unknown>,
	): void {
		const entry = {
			level,
			msg: message,
			time: new Date().toISOString(),
			...this.context,
			...data,
		};

		const fn = console[level] ?? console.log;
		fn(JSON.stringify(entry));
	}

	private getLevelName(): LogLevel {
		for (const [name, value] of Object.entries(LOG_LEVELS)) {
			if (value === this.level) {
				return name as LogLevel;
			}
		}
		return "info";
	}
}

/**
 * Create a logger from env configuration.
 */
export function createLogger(env: { LOG_LEVEL?: LogLevel }): Logger {
	return new Logger(env.LOG_LEVEL ?? "info");
}
