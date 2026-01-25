/**
 * Reusable type guards for safe type narrowing.
 *
 * These replace unsafe type assertions (as SomeType) with runtime checks
 * that provide actual type safety.
 *
 * @see Issue #80 - Type assertion cleanup
 */

// =============================================================================
// Node.js Error Type Guards
// =============================================================================

/**
 * Type guard for Node.js system errors with error codes.
 *
 * NOTE: Node.js fs/net errors extend Error with a 'code' property,
 * but TypeScript's Error type doesn't include it. This guard safely
 * narrows the type after a runtime check.
 *
 * @example
 * ```typescript
 * try {
 *   await writeFile(path, data, { flag: 'wx' });
 * } catch (err) {
 *   if (isErrnoException(err) && err.code === 'EEXIST') {
 *     // Handle file already exists
 *   }
 * }
 * ```
 */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  if (!(err instanceof Error)) return false;
  if (!('code' in err)) return false;
  const errRecord = Object.fromEntries(Object.entries(err));
  const code = errRecord.code;
  return typeof code === 'string' || code === undefined;
}

/**
 * Checks if an error has a specific Node.js error code.
 * Combines the type guard and code check in one call.
 *
 * @example
 * ```typescript
 * if (hasErrorCode(err, 'ENOENT')) {
 *   return null; // File not found
 * }
 * ```
 */
export function hasErrorCode(
  err: unknown,
  code: string
): err is NodeJS.ErrnoException & { code: string } {
  return isErrnoException(err) && err.code === code;
}

// =============================================================================
// Buffer Type Guards (for streaming)
// =============================================================================

/**
 * Type guard for Buffer instances.
 *
 * NOTE: This is a thin wrapper around Buffer.isBuffer() but provides
 * better TypeScript inference in generic contexts.
 *
 * @example
 * ```typescript
 * for await (const chunk of stream) {
 *   if (isBuffer(chunk)) {
 *     chunks.push(chunk);
 *   }
 * }
 * ```
 */
export function isBuffer(value: unknown): value is Buffer {
  return Buffer.isBuffer(value);
}
