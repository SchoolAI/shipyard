/**
 * Browser-compatible crypto utilities.
 * Uses Web Crypto API instead of Node.js crypto module.
 */

/**
 * Generate a cryptographically secure session token.
 * Browser equivalent of @shipyard/shared generateSessionToken().
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Hash a session token using SHA-256.
 * Browser equivalent of @shipyard/shared hashSessionToken().
 */
export async function hashSessionToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
