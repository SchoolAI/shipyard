type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  if (import.meta.env.DEV) {
    return 'debug';
  }
  return 'info';
}

class Logger {
  private level: number;
  private prefix: string;

  constructor(prefix = '', level: LogLevel = getLogLevel()) {
    this.level = LOG_LEVELS[level];
    this.prefix = prefix;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.debug) {
      this.log('debug', message, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.info) {
      this.log('info', message, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.warn) {
      this.log('warn', message, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.error) {
      this.log('error', message, ...args);
    }
  }

  child(prefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger(childPrefix, this.getLevelName());
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    const prefixedMessage = this.prefix ? `[${this.prefix}] ${message}` : message;
    const fn = console[level];
    fn(prefixedMessage, ...args);
  }

  private getLevelName(): LogLevel {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    for (const name of levels) {
      if (LOG_LEVELS[name] === this.level) {
        return name;
      }
    }
    return 'info';
  }
}

export const logger = new Logger();

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}
