import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, Logger, type LogLevel } from './logger';

describe('Logger', () => {
  // Store original console methods
  const originalConsole = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    log: console.log,
  };

  // Mock console methods
  let consoleSpy: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    };
    console.debug = consoleSpy.debug;
    console.info = consoleSpy.info;
    console.warn = consoleSpy.warn;
    console.error = consoleSpy.error;
    console.log = consoleSpy.log;
  });

  afterEach(() => {
    // Restore original console methods
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log = originalConsole.log;
  });

  describe('constructor', () => {
    it('creates logger with default level (info)', () => {
      const logger = new Logger();
      logger.debug('debug message');
      logger.info('info message');

      // Debug should be filtered out (level=info)
      expect(consoleSpy.debug).not.toHaveBeenCalled();
      // Info should be logged
      expect(consoleSpy.info).toHaveBeenCalledOnce();
    });

    it('creates logger with custom level', () => {
      const logger = new Logger('warn');
      logger.info('info message');
      logger.warn('warn message');

      // Info should be filtered out (level=warn)
      expect(consoleSpy.info).not.toHaveBeenCalled();
      // Warn should be logged
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
    });

    it('creates logger with context', () => {
      const logger = new Logger('info', { service: 'test-service' });
      logger.info('test message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe('test-service');
    });
  });

  describe('log levels', () => {
    it('logs debug messages when level is debug', () => {
      const logger = new Logger('debug');
      logger.debug('debug message', { extra: 'data' });

      expect(consoleSpy.debug).toHaveBeenCalledOnce();
      const output = consoleSpy.debug.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('debug');
      expect(parsed.msg).toBe('debug message');
      expect(parsed.extra).toBe('data');
      expect(parsed.time).toBeDefined();
    });

    it('logs info messages when level is info or lower', () => {
      const logger = new Logger('info');
      logger.info('info message');

      expect(consoleSpy.info).toHaveBeenCalledOnce();
      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.msg).toBe('info message');
    });

    it('logs warn messages when level is warn or lower', () => {
      const logger = new Logger('warn');
      logger.warn('warn message');

      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      const output = consoleSpy.warn.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('warn');
      expect(parsed.msg).toBe('warn message');
    });

    it('logs error messages at all levels', () => {
      const logger = new Logger('error');
      logger.error('error message');

      expect(consoleSpy.error).toHaveBeenCalledOnce();
      const output = consoleSpy.error.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('error');
      expect(parsed.msg).toBe('error message');
    });
  });

  describe('log level filtering', () => {
    it('filters debug logs when level is info', () => {
      const logger = new Logger('info');
      logger.debug('should not appear');
      logger.info('should appear');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalledOnce();
    });

    it('filters debug and info logs when level is warn', () => {
      const logger = new Logger('warn');
      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should appear');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
    });

    it('filters debug, info, and warn logs when level is error', () => {
      const logger = new Logger('error');
      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should not appear');
      logger.error('should appear');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledOnce();
    });

    it('logs all levels when level is debug', () => {
      const logger = new Logger('debug');
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy.debug).toHaveBeenCalledOnce();
      expect(consoleSpy.info).toHaveBeenCalledOnce();
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      expect(consoleSpy.error).toHaveBeenCalledOnce();
    });
  });

  describe('structured output', () => {
    it('includes timestamp in ISO format', () => {
      const logger = new Logger('info');
      logger.info('test message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.time).toBeDefined();
      expect(typeof parsed.time).toBe('string');
      // Check if it's a valid ISO 8601 timestamp
      expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
    });

    it('includes additional data in log output', () => {
      const logger = new Logger('info');
      logger.info('test message', { userId: 123, action: 'login' });

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.userId).toBe(123);
      expect(parsed.action).toBe('login');
    });

    it('merges context and data in output', () => {
      const logger = new Logger('info', { service: 'auth' });
      logger.info('test message', { userId: 123 });

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe('auth');
      expect(parsed.userId).toBe(123);
    });

    it('data overrides context when keys conflict', () => {
      const logger = new Logger('info', { key: 'context-value' });
      logger.info('test message', { key: 'data-value' });

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.key).toBe('data-value');
    });

    it('logs without additional data', () => {
      const logger = new Logger('info');
      logger.info('test message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe('info');
      expect(parsed.msg).toBe('test message');
      expect(parsed.time).toBeDefined();
    });
  });

  describe('child logger', () => {
    it('creates child with additional context', () => {
      const parent = new Logger('info', { service: 'api' });
      const child = parent.child({ requestId: 'req-123' });

      child.info('test message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe('api');
      expect(parsed.requestId).toBe('req-123');
    });

    it('child inherits parent log level', () => {
      const parent = new Logger('warn');
      const child = parent.child({ module: 'auth' });

      child.debug('should not appear');
      child.info('should not appear');
      child.warn('should appear');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
    });

    it('child context overrides parent context for same keys', () => {
      const parent = new Logger('info', { env: 'production' });
      const child = parent.child({ env: 'development' });

      child.info('test message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.env).toBe('development');
    });

    it('child retains original parent context', () => {
      const parent = new Logger('info', { service: 'api' });
      parent.child({ requestId: 'req-123' });

      parent.info('parent message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe('api');
      expect(parsed.requestId).toBeUndefined();
    });

    it('creates nested child loggers', () => {
      const root = new Logger('info', { service: 'api' });
      const child1 = root.child({ module: 'auth' });
      const child2 = child1.child({ function: 'login' });

      child2.info('nested message');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.service).toBe('api');
      expect(parsed.module).toBe('auth');
      expect(parsed.function).toBe('login');
    });
  });

  describe('createLogger', () => {
    it('creates logger with env LOG_LEVEL', () => {
      const logger = createLogger({ LOG_LEVEL: 'debug' });
      logger.debug('debug message');

      expect(consoleSpy.debug).toHaveBeenCalledOnce();
    });

    it('creates logger with default info level when LOG_LEVEL not provided', () => {
      const logger = createLogger({});
      logger.debug('should not appear');
      logger.info('should appear');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalledOnce();
    });

    it('respects all valid log levels from env', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      for (const level of levels) {
        // Reset spies
        consoleSpy.debug.mockClear();
        consoleSpy.info.mockClear();
        consoleSpy.warn.mockClear();
        consoleSpy.error.mockClear();

        const logger = createLogger({ LOG_LEVEL: level });
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');

        // Verify filtering based on level
        switch (level) {
          case 'debug':
            expect(consoleSpy.debug).toHaveBeenCalled();
            expect(consoleSpy.info).toHaveBeenCalled();
            expect(consoleSpy.warn).toHaveBeenCalled();
            expect(consoleSpy.error).toHaveBeenCalled();
            break;
          case 'info':
            expect(consoleSpy.debug).not.toHaveBeenCalled();
            expect(consoleSpy.info).toHaveBeenCalled();
            expect(consoleSpy.warn).toHaveBeenCalled();
            expect(consoleSpy.error).toHaveBeenCalled();
            break;
          case 'warn':
            expect(consoleSpy.debug).not.toHaveBeenCalled();
            expect(consoleSpy.info).not.toHaveBeenCalled();
            expect(consoleSpy.warn).toHaveBeenCalled();
            expect(consoleSpy.error).toHaveBeenCalled();
            break;
          case 'error':
            expect(consoleSpy.debug).not.toHaveBeenCalled();
            expect(consoleSpy.info).not.toHaveBeenCalled();
            expect(consoleSpy.warn).not.toHaveBeenCalled();
            expect(consoleSpy.error).toHaveBeenCalled();
            break;
        }
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty string message', () => {
      const logger = new Logger('info');
      logger.info('');

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.msg).toBe('');
    });

    it('handles complex nested data', () => {
      const logger = new Logger('info');
      logger.info('test', {
        nested: { deeply: { value: 123 } },
        array: [1, 2, 3],
      });

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.nested.deeply.value).toBe(123);
      expect(parsed.array).toEqual([1, 2, 3]);
    });

    it('handles null and undefined values in data', () => {
      const logger = new Logger('info');
      logger.info('test', { nullValue: null, undefinedValue: undefined });

      const output = consoleSpy.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.nullValue).toBeNull();
      // undefined values are not serialized in JSON
      expect('undefinedValue' in parsed).toBe(false);
    });
  });
});
