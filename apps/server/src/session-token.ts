import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifySessionToken(token: string, storedHash: string): boolean {
  const tokenHash = hashSessionToken(token);

  // Convert hex strings to Buffers for constant-time comparison
  // This prevents timing attacks where attacker measures response time to guess hash
  try {
    const tokenHashBuffer = Buffer.from(tokenHash, 'hex');
    const storedHashBuffer = Buffer.from(storedHash, 'hex');

    // timingSafeEqual throws if lengths don't match, so guard against it
    if (tokenHashBuffer.length !== storedHashBuffer.length) {
      return false;
    }

    return timingSafeEqual(tokenHashBuffer, storedHashBuffer);
  } catch {
    // Invalid hex or other error - reject the token
    return false;
  }
}
