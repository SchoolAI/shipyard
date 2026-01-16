import pino from 'pino';
import { serverConfig } from './config/env/server.js';

// TODO: where do these go for MCP? can we also write to a file like the hook?
// would be nice to figure out where these are currently going as well/
const transport =
  serverConfig.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          destination: 2, // stderr - CRITICAL: MCP uses stdout for protocol
        },
      }
    : undefined;

export const logger = pino(
  {
    level: serverConfig.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport ? pino.transport(transport) : pino.destination(2) // stderr for production too
);
