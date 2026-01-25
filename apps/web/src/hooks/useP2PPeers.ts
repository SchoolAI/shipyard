/**
 * Hook to track connected P2P peers from y-webrtc provider.
 *
 * Uses the awareness protocol to detect connected peers and their identities.
 * The awareness protocol has a heartbeat/timeout mechanism that properly detects
 * disconnected peers, unlike raw WebRTC connections.
 *
 * @see Issue #41 - Context Teleportation
 */

import { type EnvironmentContext, EnvironmentContextSchema } from '@shipyard/schema';
import { useCallback, useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import { z } from 'zod';

/**
 * Represents a connected P2P peer with identity information.
 */
export interface ConnectedPeer {
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
  /** Environment context (project, branch, hostname) for agent identification */
  context?: EnvironmentContext;
}

/**
 * Schema for validating awareness state from P2P peers.
 * SECURITY: Awareness data from peers is UNTRUSTED external input.
 */
const AwarenessUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

const AwarenessPlanStatusSchema = z.object({
  user: AwarenessUserSchema.optional(),
  isOwner: z.boolean().optional(),
  webrtcPeerId: z.string().optional(),
  platform: z.string().optional(),
  context: EnvironmentContextSchema.optional(),
});

const AwarenessStateSchema = z.object({
  planStatus: AwarenessPlanStatusSchema.optional(),
});

/**
 * Extracts user info from awareness state.
 * Handles the planStatus field set by useMultiProviderSync.
 * SECURITY: Validates untrusted peer data with Zod schema.
 */
function extractPeerInfo(peerId: number, state: Record<string, unknown>): ConnectedPeer | null {
  // Validate awareness state from untrusted peer
  const validated = AwarenessStateSchema.safeParse(state);
  if (!validated.success) {
    // Invalid peer data - return minimal info
    return {
      webrtcPeerId: undefined,
      platform: 'browser',
      name: `Peer ${peerId}`,
      color: '#888888',
      isOwner: false,
      connectedAt: Date.now(),
      context: undefined,
    };
  }

  const planStatus = validated.data.planStatus;

  if (!planStatus?.user) {
    // Unknown peer without identity - still track them
    return {
      webrtcPeerId: planStatus?.webrtcPeerId,
      platform: planStatus?.platform ?? 'browser',
      name: `Peer ${peerId}`,
      color: '#888888',
      isOwner: false,
      connectedAt: Date.now(),
      context: planStatus?.context,
    };
  }

  return {
    webrtcPeerId: planStatus.webrtcPeerId,
    platform: planStatus.platform ?? 'browser',
    name: planStatus.user.name,
    color: planStatus.user.color,
    isOwner: planStatus.isOwner ?? false,
    connectedAt: Date.now(),
    context: planStatus.context,
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

      const stateRecord =
        state && typeof state === 'object' ? Object.fromEntries(Object.entries(state)) : {};
      const peerInfo = extractPeerInfo(clientId, stateRecord);
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
