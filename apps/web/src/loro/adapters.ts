import { IndexedDBStorageAdapter } from '@loro-extended/adapter-indexeddb';
import { WsClientNetworkAdapter } from '@loro-extended/adapter-websocket/client';
import { DEFAULT_EPOCH, isEpochRejection, parseEpochFromReason } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';
import { resetAllBrowserStorage } from '../utils/reset-storage';
import { getWebRtcAdapter } from './webrtc';

const EPOCH_STORAGE_KEY = 'shipyard-epoch';
const EPOCH_RESET_NEEDED_KEY = 'shipyard-epoch-reset-needed';
const EPOCH_PENDING_VALUE_KEY = 'shipyard-epoch-pending-value';

/**
 * Handle pending epoch reset from previous page load.
 * This runs BEFORE adapters are created to ensure clean state.
 */
function handlePendingEpochReset(): void {
  if (typeof window === 'undefined') return;

  if (sessionStorage.getItem(EPOCH_RESET_NEEDED_KEY) === 'true') {
    sessionStorage.removeItem(EPOCH_RESET_NEEDED_KEY);

    // Get the new epoch value from sessionStorage (set by handleEpochRejection)
    const pendingEpoch = sessionStorage.getItem(EPOCH_PENDING_VALUE_KEY);
    sessionStorage.removeItem(EPOCH_PENDING_VALUE_KEY);

    // Clear epoch-related localStorage synchronously
    localStorage.removeItem('shipyard-peer-id');

    // Set the new epoch value if we have one, otherwise clear it
    if (pendingEpoch) {
      localStorage.setItem(EPOCH_STORAGE_KEY, pendingEpoch);
    } else {
      localStorage.removeItem(EPOCH_STORAGE_KEY);
    }

    // Clear IndexedDB asynchronously (non-blocking)
    resetAllBrowserStorage().catch(() => {
      // Ignore errors - best effort cleanup
    });
  }
}

// Run epoch reset check BEFORE creating adapters
handlePendingEpochReset();

function getWsUrl(): string {
  const port = import.meta.env.VITE_WS_PORT || '4445';
  const isSecure = window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? 'localhost' : window.location.host;
  return `${protocol}//${host}:${port}/ws`;
}

function getPeerId(): string {
  const key = 'shipyard-peer-id';
  let peerId = localStorage.getItem(key);
  if (!peerId) {
    peerId = nanoid();
    localStorage.setItem(key, peerId);
  }
  return peerId;
}

/**
 * Get the current epoch from localStorage.
 * If no epoch is stored, returns the default and stores it.
 */
function getStoredEpoch(): number {
  const stored = localStorage.getItem(EPOCH_STORAGE_KEY);
  if (stored) {
    const parsed = Number.parseInt(stored, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  localStorage.setItem(EPOCH_STORAGE_KEY, String(DEFAULT_EPOCH));
  return DEFAULT_EPOCH;
}

/**
 * Handle epoch rejection by marking for reset and reloading immediately.
 * Storage is cleared on next page load BEFORE adapters are created.
 *
 * @param requiredEpoch The epoch the server requires (extracted from close reason)
 */
function handleEpochRejection(requiredEpoch: number | null): void {
  // Already marked for reset - don't trigger infinite reloads
  if (sessionStorage.getItem(EPOCH_RESET_NEEDED_KEY) === 'true') {
    return;
  }

  // Mark for reset on next page load (sync)
  sessionStorage.setItem(EPOCH_RESET_NEEDED_KEY, 'true');

  // Store the required epoch so we use it after reload
  if (requiredEpoch !== null) {
    sessionStorage.setItem(EPOCH_PENDING_VALUE_KEY, String(requiredEpoch));
  }

  // Reload immediately - don't wait for async operations
  // The loro-extended adapter will try to reconnect, but the page reload
  // will interrupt it. On next load, handlePendingEpochReset() clears storage
  // before adapters are created.
  window.location.reload();
}

/**
 * WebSocket wrapper that intercepts close events for epoch rejection handling.
 * Loro-extended's WsClientNetworkAdapter doesn't expose close codes externally,
 * so we wrap WebSocket to intercept them before they reach the adapter.
 */
class EpochAwareWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);

    this.addEventListener('close', (event: CloseEvent) => {
      if (isEpochRejection(event.code, event.reason)) {
        // Extract the required epoch from the close reason (format: "epoch_too_old:5")
        const requiredEpoch = parseEpochFromReason(event.reason);
        handleEpochRejection(requiredEpoch);
      }
    });
  }
}

const peerId = getPeerId();
const epoch = getStoredEpoch();
const wsUrl = `${getWsUrl()}?peerId=${peerId}&epoch=${epoch}`;

export const wsAdapter = new WsClientNetworkAdapter({
  url: wsUrl,
  WebSocket: EpochAwareWebSocket,
  reconnect: {
    enabled: true,
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 30000,
  },
  keepaliveInterval: 30000,
});

export const storageAdapter = new IndexedDBStorageAdapter();

export const webRtcAdapter = getWebRtcAdapter();

export const loroAdapters = [storageAdapter, wsAdapter, webRtcAdapter];

/**
 * Update the stored epoch after successful connection.
 * Called when the server provides the current epoch.
 */
export function updateStoredEpoch(newEpoch: number): void {
  if (newEpoch > getStoredEpoch()) {
    localStorage.setItem(EPOCH_STORAGE_KEY, String(newEpoch));
  }
}
