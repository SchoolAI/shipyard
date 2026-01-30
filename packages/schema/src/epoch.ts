/**
 * RFC 6455 reserves 4000-4999 for application-specific close codes.
 */
export const EPOCH_CLOSE_CODES = {
  EPOCH_TOO_OLD: 4100,
} as const;

export type EpochCloseCode = (typeof EPOCH_CLOSE_CODES)[keyof typeof EPOCH_CLOSE_CODES];

export const EPOCH_CLOSE_REASONS = {
  [EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]: 'epoch_too_old',
} as const;

export type EpochCloseReason = (typeof EPOCH_CLOSE_REASONS)[EpochCloseCode];

export const DEFAULT_EPOCH = 2;

export function getEpochFromMetadata(metadata: { epoch?: number }): number {
  return metadata.epoch ?? DEFAULT_EPOCH;
}

export function isEpochValid(epoch: number, minimumEpoch: number): boolean {
  return epoch >= minimumEpoch;
}

/**
 * Result of parsing a WebSocket URL for Y.Doc sync.
 */
export interface ParsedWebSocketUrl {
  /** Document name (planId or 'plan-index') */
  docName: string;
  /** Client's epoch from query param, or null if not provided */
  clientEpoch: number | null;
}

/**
 * Parse a WebSocket URL to extract docName and epoch query param.
 *
 * y-websocket clients connect to URLs like:
 * - /planId (no epoch - older clients or MCP)
 * - /planId?epoch=2 (browser with IndexedDB epoch)
 *
 * Without this parsing, the server treats "planId?epoch=2" as the document name,
 * causing MCP and browser to sync different Y.Docs (regression from commit 4242723).
 *
 * @param url - The WebSocket URL path (e.g., "/planId?epoch=2")
 * @returns Parsed docName and clientEpoch
 */
export function parseWebSocketUrl(url: string): ParsedWebSocketUrl {
  const cleanUrl = url || '/';
  const urlParts = cleanUrl.split('?');
  const docName = urlParts[0]?.replace(/^\//, '') || 'default';

  let clientEpoch: number | null = null;
  if (urlParts[1]) {
    const params = new URLSearchParams(urlParts[1]);
    const epochParam = params.get('epoch');
    if (epochParam) {
      const parsed = Number.parseInt(epochParam, 10);
      if (!Number.isNaN(parsed)) {
        clientEpoch = parsed;
      }
    }
  }

  return { docName, clientEpoch };
}
