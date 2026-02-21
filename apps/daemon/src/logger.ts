import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { getShipyardHome } from './env.js';

const logDir = join(getShipyardHome(), 'logs');
mkdirSync(logDir, { recursive: true, mode: 0o700 });

const logFilePath = join(logDir, 'daemon.log');

/** Exposed for output.ts to append CLI output to the same log file. */
export function getLogFilePath(): string {
  return logFilePath;
}

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL ?? 'info';

const transport = pino.transport({
  targets: [
    ...(isDev
      ? [{ target: 'pino-pretty', options: { colorize: true }, level }]
      : [{ target: 'pino/file', options: { destination: 1 }, level }]),
    {
      target: 'pino-roll',
      options: {
        file: logFilePath,
        frequency: 'daily',
        limit: { count: 7 },
        mkdir: true,
      },
      level,
    },
  ],
});

export const logger = pino({ level }, transport);

export function createChildLogger(context: { taskId?: string; sessionId?: string; mode?: string }) {
  return logger.child(context);
}
