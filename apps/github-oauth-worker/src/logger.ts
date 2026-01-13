/**
 * Structured logger for Cloudflare Workers
 *
 * Provides pino-like interface but uses console methods under the hood
 * since Cloudflare Workers don't support pino.
 *
 * Logs are automatically captured by Cloudflare's logging infrastructure.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class CloudflareLogger {
  private logLevel: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }

  private formatMessage(context: LogContext | string, message?: string): string {
    if (typeof context === 'string') {
      return context;
    }

    if (message) {
      return `${message} ${JSON.stringify(context)}`;
    }

    return JSON.stringify(context);
  }

  debug(context: LogContext | string, message?: string): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage(context, message));
  }

  info(context: LogContext | string, message?: string): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage(context, message));
  }

  warn(context: LogContext | string, message?: string): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage(context, message));
  }

  error(context: LogContext | string, message?: string): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage(context, message));
  }
}

// Default to 'info' level - Cloudflare Workers don't have process.env at module init
// For now, we use a fixed log level. Could be made configurable via Env in the future.
export const logger = new CloudflareLogger('info');
