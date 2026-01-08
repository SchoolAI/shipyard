import { createHash, randomBytes } from 'node:crypto';

/**
 * Generate a cryptographically secure session token.
 * Returns ~43 character base64url string (256 bits of entropy).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash a session token for storage.
 * Uses SHA256 to create a one-way hash.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a session token against a stored hash.
 */
export function verifySessionToken(token: string, storedHash: string): boolean {
  const tokenHash = hashSessionToken(token);
  return tokenHash === storedHash;
}
