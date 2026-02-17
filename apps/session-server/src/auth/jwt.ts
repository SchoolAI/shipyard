/**
 * Shipyard JWT generation and validation.
 *
 * Uses HMAC-SHA256 for signing (simple, fast, sufficient for our use case).
 */

import { z } from 'zod';
import { hmacSign, hmacVerify } from '../utils/crypto';
import type { ShipyardJWTClaims } from './types';

/** Schema for validating JWT payload structure */
const ShipyardJWTClaimsSchema = z.object({
  iss: z.string().startsWith('shipyard:'),
  sub: z.string(),
  displayName: z.string(),
  providers: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
  scope: z.string().optional(),
  machineId: z.string().optional(),
});

/** Session token expiration: 30 days */
const SESSION_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Agent token expiration: 24 hours */
const AGENT_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a session JWT for browser/CLI use.
 */
export async function generateSessionToken(
  user: { id: string; displayName: string },
  providers: string[],
  secret: string,
  environment: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: ShipyardJWTClaims = {
    iss: `shipyard:${environment}`,
    sub: user.id,
    displayName: user.displayName,
    providers,
    iat: now,
    exp: now + Math.floor(SESSION_TOKEN_EXPIRY_MS / 1000),
  };
  return signJWT(claims, secret);
}

/**
 * Generate a scoped agent JWT.
 */
export async function generateAgentToken(
  user: { id: string; displayName: string },
  providers: string[],
  taskId: string,
  machineId: string,
  secret: string,
  environment: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: ShipyardJWTClaims = {
    iss: `shipyard:${environment}`,
    sub: user.id,
    displayName: user.displayName,
    providers,
    iat: now,
    exp: now + Math.floor(AGENT_TOKEN_EXPIRY_MS / 1000),
    scope: `task:${taskId}`,
    machineId,
  };
  return signJWT(claims, secret);
}

/**
 * Validate and decode a JWT.
 * Returns null if invalid or expired.
 */
export async function validateToken(
  token: string | undefined,
  secret: string,
  environment: string
): Promise<ShipyardJWTClaims | null> {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const signatureB64 = parts[2];

    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const isValid = await hmacVerify(`${headerB64}.${payloadB64}`, signatureB64, secret);
    if (!isValid) {
      return null;
    }

    const decoded: unknown = JSON.parse(base64UrlDecode(payloadB64));
    const parseResult = ShipyardJWTClaimsSchema.safeParse(decoded);
    if (!parseResult.success) {
      return null;
    }

    const payload = parseResult.data;

    if (payload.iss !== `shipyard:${environment}`) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Decode without validation (for debugging only).
 */
export function decodeToken(token: string): ShipyardJWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadB64 = parts[1];
    if (!payloadB64) return null;
    const decoded: unknown = JSON.parse(base64UrlDecode(payloadB64));
    const parseResult = ShipyardJWTClaimsSchema.safeParse(decoded);
    return parseResult.success ? parseResult.data : null;
  } catch {
    return null;
  }
}

async function signJWT(claims: ShipyardJWTClaims, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signature = await hmacSign(`${headerB64}.${payloadB64}`, secret);
  return `${headerB64}.${payloadB64}.${signature}`;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return atob(base64);
}
