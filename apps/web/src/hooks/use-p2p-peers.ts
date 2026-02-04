import { useEphemeral } from '@loro-extended/react';
import type { BrowserContext, EnvironmentContext, PeerPresence } from '@shipyard/loro-schema';
import { useMemo } from 'react';
import { useRoomHandle } from '@/loro/selectors/room-selectors';

export interface ConnectedPeer {
  webrtcPeerId: string | undefined;
  platform: string;
  name: string;
  color: string;
  isOwner: boolean;
  connectedAt: number;
  context?: EnvironmentContext;
  browserContext?: BrowserContext;
  hasDaemon?: boolean;
}

interface UseP2PPeersResult {
  connectedPeers: ConnectedPeer[];
  peerCount: number;
  isConnected: boolean;
  self: PeerPresence | undefined;
}

function toConnectedPeer(peerId: string, presence: PeerPresence): ConnectedPeer {
  return {
    webrtcPeerId: peerId,
    platform: presence.platform,
    name: presence.name,
    color: presence.color,
    isOwner: presence.isOwner,
    connectedAt: presence.connectedAt,
    context: presence.context ?? undefined,
    browserContext: presence.browserContext ?? undefined,
    hasDaemon: presence.hasDaemon,
  };
}

export function useP2PPeers(): UseP2PPeersResult {
  const roomHandle = useRoomHandle();
  const { self, peers } = useEphemeral(roomHandle.presence);

  const connectedPeers = useMemo(() => {
    const result: ConnectedPeer[] = [];
    for (const [peerId, presence] of peers.entries()) {
      result.push(toConnectedPeer(peerId, presence));
    }
    result.sort((a, b) => a.connectedAt - b.connectedAt);
    return result;
  }, [peers]);

  return {
    connectedPeers,
    peerCount: connectedPeers.length,
    isConnected: true,
    self,
  };
}
