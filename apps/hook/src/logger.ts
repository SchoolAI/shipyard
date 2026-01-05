/**
 * Logger for the hook process.
 * CRITICAL: Must log to stderr since stdout is reserved for hook JSON response.
 */

import pino from 'pino';

// Create logger that writes to stderr (fd 2)
// This is essential for MCP/hook compatibility where stdout is the response channel
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(2) // stderr
);
