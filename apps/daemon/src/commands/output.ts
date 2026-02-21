import { appendFileSync } from 'node:fs';
import { getLogFilePath } from '../logger.js';

/**
 * CLI output helpers for interactive commands (login, logout).
 * Uses process.stdout/stderr directly to avoid pino JSON formatting.
 * Also appends a structured JSON line to the daemon log file for forensics.
 */

function appendToLogFile(level: 'info' | 'error', message: string): void {
  try {
    const entry = JSON.stringify({
      level: level === 'error' ? 50 : 30,
      time: Date.now(),
      source: 'cli',
      msg: message,
    });
    appendFileSync(getLogFilePath(), `${entry}\n`);
  } catch {
    /** Log file write failure must never break CLI output */
  }
}

export function print(message: string): void {
  process.stdout.write(`${message}\n`);
  appendToLogFile('info', message);
}

export function printError(message: string): void {
  process.stderr.write(`${message}\n`);
  appendToLogFile('error', message);
}
