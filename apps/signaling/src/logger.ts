import pino from 'pino';
import { serverConfig } from './config/env/server.js';

const transport =
  serverConfig.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          destination: 2,
        },
      }
    : undefined;

export const logger = pino(
  {
    level: serverConfig.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport ? pino.transport(transport) : pino.destination(2)
);
