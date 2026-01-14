/**
 * Simple logger for Cloudflare Workers.
 * Cloudflare Workers don't support Node.js APIs like pino,
 * so we use console.* but follow pino's structured logging patterns.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Format a log message with structured context.
 */
function formatLog(level: LogLevel, context: LogContext | string, message?: string): string {
  const timestamp = new Date().toISOString();

  if (typeof context === 'string') {
    // Simple message without context
    return `[${timestamp}] ${level.toUpperCase()}: ${context}`;
  }

  // Structured logging with context
  const contextStr = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}:${contextStr} ${message || ''}`;
}

export const logger = {
  info(context: LogContext | string, message?: string): void {
    console.log(formatLog('info', context, message));
  },

  warn(context: LogContext | string, message?: string): void {
    console.warn(formatLog('warn', context, message));
  },

  error(context: LogContext | string, message?: string): void {
    console.error(formatLog('error', context, message));
  },

  debug(context: LogContext | string, message?: string): void {
    console.debug(formatLog('debug', context, message));
  },
};
