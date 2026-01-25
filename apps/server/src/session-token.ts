import { timingSafeEqual } from 'node:crypto';

export { generateSessionToken, hashSessionToken } from '@shipyard/shared';

import { hashSessionToken } from '@shipyard/shared';

/**
 * Verify a session token against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifySessionToken(token: string, storedHash: string): boolean {
  const tokenHash = hashSessionToken(token);

  /*
   * Convert hex strings to Buffers for constant-time comparison
   * This prevents timing attacks where attacker measures response time to guess hash
   */
  try {
    const tokenHashBuffer = Buffer.from(tokenHash, 'hex');
    const storedHashBuffer = Buffer.from(storedHash, 'hex');

    /** timingSafeEqual throws if lengths don't match, so guard against it */
    if (tokenHashBuffer.length !== storedHashBuffer.length) {
      return false;
    }

    return timingSafeEqual(tokenHashBuffer, storedHashBuffer);
  } catch {
    /** Invalid hex or other error - reject the token */
    return false;
  }
}
