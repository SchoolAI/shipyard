export function hasAnyConnection(hubConnected: boolean, peerCount: number): boolean {
  return hubConnected || peerCount > 0;
}

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
