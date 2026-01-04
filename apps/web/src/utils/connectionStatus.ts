/**
 * Utility for determining connection status based on MCP and P2P peer counts.
 * Used by both SyncStatus and Sidebar to ensure consistent state display.
 */

/**
 * Check if there are any active connections (MCP or P2P).
 * Used to determine if showing "Offline" vs "Connected/Syncing".
 */
export function hasAnyConnection(mcpCount: number, peerCount: number): boolean {
  return mcpCount > 0 || peerCount > 0;
}

/**
 * Format connection details for display.
 * Returns string like "(1 MCP, 2 P2P)" or null if no connections.
 */
export function formatConnectionInfo(
  mcpActive: number,
  mcpTotal: number,
  peerCount: number
): string | null {
  const parts: string[] = [];

  if (mcpTotal > 0) {
    if (mcpActive === mcpTotal) {
      parts.push(`${mcpActive} MCP`);
    } else {
      parts.push(`${mcpActive}/${mcpTotal} MCP`);
    }
  }

  if (peerCount > 0) {
    parts.push(`${peerCount} P2P`);
  }

  return parts.length > 0 ? `(${parts.join(', ')})` : null;
}
