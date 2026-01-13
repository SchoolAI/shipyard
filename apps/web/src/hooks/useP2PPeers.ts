/**
 * Hook to track connected P2P peers from y-webrtc provider.
 *
 * Uses the awareness protocol to detect connected peers and their identities.
 * The awareness protocol has a heartbeat/timeout mechanism that properly detects
 * disconnected peers, unlike raw WebRTC connections.
 *
 * @see Issue #41 - Context Teleportation
 */

import { useCallback, useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';

/**
 * Represents a connected P2P peer with identity information.
 */
export interface ConnectedPeer {
  /**
   * Awareness client ID from Yjs (number).
   * Used internally by Yjs for document sync.
   * @deprecated Use webrtcPeerId for P2P transfers.
   */
  peerId: number;
  /**
   * WebRTC peer ID (UUID string) for P2P transfers.
   * This is the key used in room.webrtcConns Map.
   * May be undefined if the peer hasn't broadcast their peerId yet.
   */
  webrtcPeerId: string | undefined;
  /** Platform type (e.g., 'browser', 'claude-code', 'devin') */
  platform: string;
  /** Display name for the peer */
  name: string;
  /** Color for visual identification */
  color: string;
  /** Whether this peer is the owner of the plan */
  isOwner: boolean;
  /** Connection timestamp */
  connectedAt: number;
}

/**
 * Extracts user info from awareness state.
 * Handles the planStatus field set by useMultiProviderSync.
 */
function extractPeerInfo(peerId: number, state: Record<string, unknown>): ConnectedPeer | null {
  // The awareness state contains planStatus from useMultiProviderSync
  const planStatus = state.planStatus as
    | {
        user?: { id: string; name: string; color: string };
        isOwner?: boolean;
        webrtcPeerId?: string;
      }
    | undefined;

  if (!planStatus?.user) {
    // Unknown peer without identity - still track them
    return {
      peerId,
      webrtcPeerId: planStatus?.webrtcPeerId,
      platform: 'browser',
      name: `Peer ${peerId}`,
      color: '#888888',
      isOwner: false,
      connectedAt: Date.now(),
    };
  }

  return {
    peerId,
    webrtcPeerId: planStatus.webrtcPeerId,
    platform: 'browser', // TODO: Could be enhanced to detect platform
    name: planStatus.user.name,
    color: planStatus.user.color,
    isOwner: planStatus.isOwner ?? false,
    connectedAt: Date.now(),
  };
}

interface UseP2PPeersResult {
  /** List of connected peers (excluding self) */
  connectedPeers: ConnectedPeer[];
  /** Number of connected peers */
  peerCount: number;
  /** Whether P2P is connected at all */
  isConnected: boolean;
  /** Force refresh the peer list */
  refresh: () => void;
}

/**
 * Hook to track connected P2P peers from WebRTC provider.
 *
 * @param rtcProvider - WebRTC provider from useMultiProviderSync
 * @returns Object with connected peers and utility functions
 */
export function useP2PPeers(rtcProvider: WebrtcProvider | null): UseP2PPeersResult {
  const [connectedPeers, setConnectedPeers] = useState<ConnectedPeer[]>([]);

  const refresh = useCallback(() => {
    if (!rtcProvider) {
      setConnectedPeers([]);
      return;
    }

    const awareness = rtcProvider.awareness;
    const states = awareness.getStates();
    const myClientId = awareness.clientID;

    const peers: ConnectedPeer[] = [];

    states.forEach((state, clientId) => {
      // Skip ourselves
      if (clientId === myClientId) return;

      const peerInfo = extractPeerInfo(clientId, state as Record<string, unknown>);
      if (peerInfo) {
        peers.push(peerInfo);
      }
    });

    setConnectedPeers(peers);
  }, [rtcProvider]);

  useEffect(() => {
    if (!rtcProvider) {
      setConnectedPeers([]);
      return;
    }

    const awareness = rtcProvider.awareness;

    // Initial load
    refresh();

    // Subscribe to awareness changes
    const handleChange = () => {
      refresh();
    };

    awareness.on('change', handleChange);

    return () => {
      awareness.off('change', handleChange);
    };
  }, [rtcProvider, refresh]);

  return {
    connectedPeers,
    peerCount: connectedPeers.length,
    isConnected: rtcProvider?.connected ?? false,
    refresh,
  };
}
