/**
 * P2P Peer Selector - Select a peer to launch agent via P2P
 *
 * Shown when local daemon is unavailable but connected peers have daemon.
 * Allows user to select which peer should launch the agent.
 *
 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
 */

import { Alert, Card, Label, Radio, RadioGroup } from '@heroui/react';
import { Cloud, Monitor, Smartphone } from 'lucide-react';
import type { ConnectedPeer } from '@/hooks/useP2PPeers';

interface P2PPeerSelectorProps {
  /** Peers that have daemon access */
  peersWithDaemon: ConnectedPeer[];
  /** Currently selected peer ID */
  selectedPeerId: string | null;
  /** Called when peer selection changes */
  onPeerSelect: (peerId: string | null) => void;
  /** Whether the selector is disabled */
  isDisabled?: boolean;
}

/**
 * Get an icon for the peer based on their browser context.
 */
function getPeerIcon(peer: ConnectedPeer) {
  const os = peer.browserContext?.os?.toLowerCase() ?? '';
  const browser = peer.browserContext?.browser?.toLowerCase() ?? '';

  if (os.includes('ios') || os.includes('android')) {
    return <Smartphone className="w-4 h-4" />;
  }
  if (browser.includes('code') || peer.platform === 'claude-code') {
    return <Cloud className="w-4 h-4" />;
  }
  return <Monitor className="w-4 h-4" />;
}

/**
 * Get a description for the peer.
 */
function getPeerDescription(peer: ConnectedPeer): string {
  const parts: string[] = [];

  if (peer.browserContext?.browser) {
    parts.push(peer.browserContext.browser);
  }
  if (peer.browserContext?.os) {
    parts.push(`on ${peer.browserContext.os}`);
  }
  if (peer.context?.hostname) {
    parts.push(`(${peer.context.hostname})`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Connected peer';
}

/**
 * Component for selecting a P2P peer to launch an agent via.
 * Shown when local daemon is unavailable but peers with daemon are available.
 */
export function P2PPeerSelector({
  peersWithDaemon,
  selectedPeerId,
  onPeerSelect,
  isDisabled,
}: P2PPeerSelectorProps) {
  if (peersWithDaemon.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Alert status="default">
        <Alert.Content>
          <Alert.Title>Local daemon not available</Alert.Title>
          <Alert.Description>
            You can launch the agent via a connected peer that has daemon access.
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <Card className="p-3">
        <RadioGroup
          value={selectedPeerId ?? undefined}
          onChange={(value) => onPeerSelect(typeof value === 'string' ? value : null)}
          isDisabled={isDisabled}
        >
          <Label className="text-sm font-medium mb-2">Select a peer to launch via:</Label>
          <div className="space-y-2 mt-2">
            {peersWithDaemon.map((peer) => (
              <Radio
                key={peer.webrtcPeerId}
                value={peer.webrtcPeerId ?? ''}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: peer.color }}
                  >
                    {getPeerIcon(peer)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{peer.name}</p>
                    <p className="text-xs text-muted-foreground">{getPeerDescription(peer)}</p>
                  </div>
                </div>
              </Radio>
            ))}
          </div>
        </RadioGroup>
      </Card>

      {!selectedPeerId && (
        <p className="text-xs text-muted-foreground">
          Select a peer above, or the task will be created without launching an agent.
        </p>
      )}
    </div>
  );
}
