/**
 * Logger for the hook process.
 * CRITICAL: Must log to stderr since stdout is reserved for hook JSON response.
 * Also logs to ~/.peer-plan/hook-debug.log for debugging.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { serverConfig } from './config/env/server.js';

const LOG_FILE = join(homedir(), '.peer-plan', 'hook-debug.log');

// Create logger that writes to BOTH stderr and a file
// TODO: review all logs in the debug file for warnings and errors and see if we can fix all issues that have come up
export const logger = pino(
  {
    level: serverConfig.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    { stream: pino.destination(2) }, // stderr
    { stream: pino.destination(LOG_FILE) }, // file
  ])
);
