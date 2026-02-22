/**
 * Epoch-based data invalidation for coordinated resets.
 *
 * When the global epoch is incremented, all clients with cached data
 * from the old epoch are rejected and must clear their local storage.
 *
 * This solves the CRDT sync problem where clearing one peer's data
 * results in other peers re-syncing their data back.
 */

/**
 * WebSocket close codes for epoch-based rejection.
 * RFC 6455 reserves 4000-4999 for application-specific codes.
 */
export const EPOCH_CLOSE_CODES = {
  EPOCH_TOO_OLD: 4100,
} as const;

export type EpochCloseCode = (typeof EPOCH_CLOSE_CODES)[keyof typeof EPOCH_CLOSE_CODES];

/**
 * Format the close reason with the required epoch.
 * Format: "epoch_too_old:5" (where 5 is the required epoch)
 */
export function formatEpochCloseReason(requiredEpoch: number): string {
  return `epoch_too_old:${requiredEpoch}`;
}

/**
 * Parse the required epoch from a close reason.
 * Returns null if the reason doesn't contain a valid epoch.
 */
export function parseEpochFromReason(reason: string): number | null {
  if (!reason.startsWith('epoch_too_old:')) return null;
  const epochStr = reason.slice('epoch_too_old:'.length);
  const parsed = Number.parseInt(epochStr, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  if (epochStr !== String(parsed)) return null;
  return parsed;
}

/**
 * Default epoch for new installations.
 * Increment this when making breaking changes to the data format.
 */
export const DEFAULT_EPOCH = 2;

/**
 * Check if a WebSocket close event indicates epoch rejection.
 */
export function isEpochRejection(code: number, reason?: string): boolean {
  return code === EPOCH_CLOSE_CODES.EPOCH_TOO_OLD || reason?.startsWith('epoch_too_old') === true;
}

/**
 * Validate that a client's epoch is compatible with the server's minimum.
 */
export function isEpochValid(clientEpoch: number, minimumEpoch: number): boolean {
  return clientEpoch >= minimumEpoch;
}

/**
 * Parse epoch from a URL search param string.
 * Returns null if not present or invalid.
 */
export function parseEpochParam(searchParams: URLSearchParams): number | null {
  const epochParam = searchParams.get('epoch');
  if (!epochParam) return null;

  const parsed = Number.parseInt(epochParam, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  if (epochParam !== String(parsed)) return null;

  return parsed;
}

/**
 * Known document ID prefixes.
 * Every document in Shipyard uses one of these prefixes in its epoch-versioned ID.
 */
const DOCUMENT_PREFIXES = ['task-meta', 'task-conv', 'task-review', 'room', 'epoch'] as const;
export type DocumentPrefix = (typeof DOCUMENT_PREFIXES)[number];

/**
 * Build an epoch-versioned document ID.
 * Pattern: "{prefix}:{key}:{epoch}"
 * Example: buildDocumentId('task-meta', 'abc123', 2) → "task-meta:abc123:2"
 */
export function buildDocumentId(prefix: DocumentPrefix, key: string, epoch: number): string {
  if (!prefix || !key) {
    throw new Error(
      `Document ID prefix and key must be non-empty: prefix="${prefix}", key="${key}"`
    );
  }
  if (prefix.includes(':') || key.includes(':')) {
    throw new Error(`Document ID parts must not contain colons: prefix="${prefix}", key="${key}"`);
  }
  if (!Number.isInteger(epoch) || epoch < 1) {
    throw new Error(`Document ID epoch must be a positive integer: ${epoch}`);
  }
  return `${prefix}:${key}:${epoch}`;
}

/** Build an epoch-versioned task-meta document ID. */
export function buildTaskMetaDocId(taskId: string, epoch: number): string {
  return buildDocumentId('task-meta', taskId, epoch);
}

/** Build an epoch-versioned task-conv document ID. */
export function buildTaskConvDocId(taskId: string, epoch: number): string {
  return buildDocumentId('task-conv', taskId, epoch);
}

/** Build an epoch-versioned task-review document ID. */
export function buildTaskReviewDocId(taskId: string, epoch: number): string {
  return buildDocumentId('task-review', taskId, epoch);
}

const DOCUMENT_PREFIX_SET: ReadonlySet<string> = new Set(DOCUMENT_PREFIXES);

function isDocumentPrefix(value: string): value is DocumentPrefix {
  return DOCUMENT_PREFIX_SET.has(value);
}

/**
 * Parse an epoch-versioned document ID.
 * Returns null if the format is invalid or the prefix is not a known DocumentPrefix.
 */
export function parseDocumentId(
  id: string
): { prefix: DocumentPrefix; key: string; epoch: number } | null {
  const parts = id.split(':');
  if (parts.length !== 3) return null;

  const [prefix, key, epochStr] = parts;
  if (!prefix || !key || !epochStr) return null;
  if (!isDocumentPrefix(prefix)) return null;

  const epoch = Number.parseInt(epochStr, 10);
  if (!Number.isFinite(epoch) || epoch < 1) return null;
  if (epochStr !== String(epoch)) return null;

  return { prefix, key, epoch };
}
