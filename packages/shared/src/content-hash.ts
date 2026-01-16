import { createHash } from 'node:crypto';

/**
 * Compute a hash of content for change detection.
 * Returns first 16 hex characters of SHA256 hash (64 bits).
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
