/**
 * Pre-signed URL generation and validation for collab rooms.
 */

import type { PresignedUrlPayload } from '../auth/types';
import { hmacSign, hmacVerify } from './crypto';

/**
 * Type guard for PresignedUrlPayload.
 */
function isValidPresignedUrlPayload(obj: unknown): obj is PresignedUrlPayload {
  if (!obj || typeof obj !== 'object') return false;
  return (
    'roomId' in obj &&
    typeof obj.roomId === 'string' &&
    obj.roomId.length > 0 &&
    'taskId' in obj &&
    typeof obj.taskId === 'string' &&
    obj.taskId.length > 0 &&
    'inviterId' in obj &&
    typeof obj.inviterId === 'string' &&
    obj.inviterId.length > 0 &&
    'exp' in obj &&
    typeof obj.exp === 'number'
  );
}

/**
 * Generate a pre-signed URL for collab room access.
 *
 * URL format: {baseUrl}/collab/{roomId}?token={signed_token}
 */
export async function generatePresignedUrlAsync(
  baseUrl: string,
  payload: PresignedUrlPayload,
  secret: string
): Promise<string> {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const signature = await hmacSign(payloadB64, secret);
  const token = `${payloadB64}.${signature}`;

  return `${baseUrl}/collab/${payload.roomId}?token=${encodeURIComponent(token)}`;
}

/**
 * Validate and decode pre-signed URL token.
 * Returns null if invalid or expired.
 */
export async function validatePresignedUrlAsync(
  token: string,
  secret: string
): Promise<PresignedUrlPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const payloadB64 = parts[0];
    const signature = parts[1];

    if (!payloadB64 || !signature) return null;

    const isValid = await hmacVerify(payloadB64, signature, secret);
    if (!isValid) return null;

    const payloadJson = base64UrlDecode(payloadB64);
    const parsed: unknown = JSON.parse(payloadJson);

    if (!isValidPresignedUrlPayload(parsed)) {
      return null;
    }

    const payload = parsed;

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
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
