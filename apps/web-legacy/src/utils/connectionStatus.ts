/**
 * Utility for determining connection status based on hub and P2P peer counts.
 * Used to ensure consistent state display across components.
 */

/**
 * Check if there are any active connections (hub WebSocket or P2P).
 * Used to determine if showing "Offline" vs "Connected/Syncing".
 */
export function hasAnyConnection(hubConnected: boolean, peerCount: number): boolean {
  return hubConnected || peerCount > 0;
}

/**
 * Format connection details for display.
 * Returns string like "(hub, 2 P2P)" or null if no connections.
 */
export function formatConnectionInfo(hubConnected: boolean, peerCount: number): string | null {
  const parts: string[] = [];

  if (hubConnected) {
    parts.push('hub');
  }

  if (peerCount > 0) {
    parts.push(`${peerCount} P2P`);
  }

  return parts.length > 0 ? `(${parts.join(', ')})` : null;
}
