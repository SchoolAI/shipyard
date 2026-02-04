import { Alert, Card, Label, Radio, RadioGroup } from '@heroui/react';
import { Cloud, Monitor, Smartphone } from 'lucide-react';

export interface ConnectedPeer {
  webrtcPeerId: string | undefined;
  platform: string;
  name: string;
  color: string;
  isOwner: boolean;
  connectedAt: number;
  context?: {
    hostname?: string;
  };
  browserContext?: {
    browser?: string;
    os?: string;
  };
  hasDaemon?: boolean;
}

interface P2PPeerSelectorProps {
  peersWithDaemon: ConnectedPeer[];
  selectedPeerId: string | null;
  onPeerSelect: (peerId: string | null) => void;
  isDisabled?: boolean;
}

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
          <Alert.Title>Local server not available</Alert.Title>
          <Alert.Description>
            You can spawn the agent via a connected peer that has server access.
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <Card className="p-3">
        <RadioGroup
          value={selectedPeerId ?? undefined}
          onChange={(value) => onPeerSelect(typeof value === 'string' ? value : null)}
          isDisabled={isDisabled}
        >
          <Label className="text-sm font-medium mb-2">Select a peer to spawn via:</Label>
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
          Select a peer above, or the task will be created without spawning an agent.
        </p>
      )}
    </div>
  );
}
