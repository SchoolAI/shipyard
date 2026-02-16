import { generateId } from '../utils/crypto';

/** Generate a human-readable 8-char user code like "ABCD-1234" */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      code += chars[byte % chars.length];
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const DEVICE_CODE_EXPIRY_MS = 15 * 60 * 1000;

export interface DeviceSession {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
}

/**
 * Create a new device flow session.
 */
export async function createDeviceSession(db: D1Database): Promise<DeviceSession> {
  const deviceCode = generateId(32);
  const userCode = generateUserCode();
  const now = Date.now();
  const expiresAt = now + DEVICE_CODE_EXPIRY_MS;

  await db
    .prepare('INSERT INTO pending_devices (device_code, user_code, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(deviceCode, userCode, now, expiresAt)
    .run();

  return { deviceCode, userCode, expiresAt };
}

/**
 * Authorize a device session (called after user completes OAuth in browser).
 * Returns true if the user code was found and authorized.
 */
export async function authorizeDevice(userCode: string, userId: string, db: D1Database): Promise<boolean> {
  const now = Date.now();
  const result = await db
    .prepare(
      'UPDATE pending_devices SET authorized_user_id = ?, authorized_at = ? WHERE user_code = ? AND expires_at > ? AND authorized_user_id IS NULL'
    )
    .bind(userId, now, userCode, now)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Poll for device authorization.
 * Returns the authorized user ID if the device was authorized, null if still pending.
 * Throws if the device code is expired or not found.
 */
export async function pollDeviceAuthorization(
  deviceCode: string,
  db: D1Database
): Promise<{ status: 'pending' } | { status: 'authorized'; userId: string } | { status: 'expired' } | { status: 'not_found' }> {
  const row = await db
    .prepare('SELECT authorized_user_id, expires_at FROM pending_devices WHERE device_code = ?')
    .bind(deviceCode)
    .first<{ authorized_user_id: string | null; expires_at: number }>();

  if (!row) return { status: 'not_found' };
  if (row.expires_at < Date.now()) return { status: 'expired' };
  if (row.authorized_user_id) return { status: 'authorized', userId: row.authorized_user_id };
  return { status: 'pending' };
}

/**
 * Find a pending device by user code (for the verification page).
 */
export async function findDeviceByUserCode(
  userCode: string,
  db: D1Database
): Promise<{ deviceCode: string; expiresAt: number } | null> {
  const row = await db
    .prepare(
      'SELECT device_code, expires_at FROM pending_devices WHERE user_code = ? AND expires_at > ? AND authorized_user_id IS NULL'
    )
    .bind(userCode, Date.now())
    .first<{ device_code: string; expires_at: number }>();

  if (!row) return null;
  return { deviceCode: row.device_code, expiresAt: row.expires_at };
}

/**
 * Delete expired device sessions. Call periodically or on each request.
 */
export async function cleanupExpiredDevices(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM pending_devices WHERE expires_at < ?').bind(Date.now()).run();
  return result.meta.changes ?? 0;
}
