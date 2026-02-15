import { nanoid } from 'nanoid';

/**
 * Canonical user ID for local (single-user) mode.
 * Used as the userId segment in room document IDs.
 */
export const LOCAL_USER_ID = 'local-user';

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type TaskId = Brand<string, 'TaskId'>;
export type SessionId = Brand<string, 'SessionId'>;

export function generateTaskId(): TaskId {
  // eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
  return nanoid() as TaskId;
}

export function generateSessionId(): SessionId {
  // eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
  return nanoid() as SessionId;
}

export function toTaskId(value: string): TaskId {
  if (value.length === 0 || value.length > 128) {
    throw new Error(`Invalid TaskId: "${value}"`);
  }
  // eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
  return value as TaskId;
}

export function toSessionId(value: string): SessionId {
  if (value.length === 0 || value.length > 128) {
    throw new Error(`Invalid SessionId: "${value}"`);
  }
  // eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
  return value as SessionId;
}
