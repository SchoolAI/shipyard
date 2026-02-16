/**
 * CLI output helpers for interactive commands (login, logout).
 * Uses process.stdout/stderr directly to avoid pino JSON formatting.
 */
export function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function printError(message: string): void {
  process.stderr.write(`${message}\n`);
}
