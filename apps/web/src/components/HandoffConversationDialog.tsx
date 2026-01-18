import { Avatar, Button, Card, Modal, Spinner } from '@heroui/react';
import { getConversationVersions, logPlanEvent, markVersionHandedOff } from '@peer-plan/schema';
import { Download, Send, Upload, Users, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useConversationTransfer } from '@/hooks/useConversationTransfer';
import { type ConnectedPeer, useP2PPeers } from '@/hooks/useP2PPeers';

// Avatar compound components have type issues in HeroUI v3 beta
const AvatarRoot = Avatar as unknown as React.FC<{
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}>;
const AvatarFallback = Avatar.Fallback as React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}>;

interface HandoffConversationDialogProps {
  /** Plan ID for handoff metadata */
  planId: string;
  /** Y.Doc for accessing plan metadata */
  ydoc: Y.Doc;
  /** WebRTC provider for P2P connection */
  rtcProvider: WebrtcProvider | null;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** If true, owner has local transcript - fetch from registry */
  hasOriginTranscript: boolean;
}

function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground capitalize">{stage}...</span>
        <span className="text-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 w-full bg-surface-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function PeerCard({
  peer,
  onSelect,
  isDisabled,
}: {
  peer: ConnectedPeer;
  onSelect: () => void;
  isDisabled: boolean;
}) {
  return (
    <Card
      className="p-3 cursor-pointer hover:bg-surface-secondary transition-colors"
      variant="secondary"
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 text-left"
        disabled={isDisabled}
        onClick={onSelect}
      >
        <AvatarRoot size="sm">
          <AvatarFallback style={{ backgroundColor: peer.color }}>
            {peer.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </AvatarRoot>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{peer.name}</p>
          <p className="text-xs text-muted-foreground">{peer.platform}</p>
        </div>
        <Send className="w-4 h-4 text-muted-foreground" />
      </button>
    </Card>
  );
}

function NoPeersState({
  onDownload,
  isHandingOff,
}: {
  onDownload: () => void;
  isHandingOff: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center">
        <Users className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No peers connected</p>
        <p className="text-xs text-muted-foreground mt-1">
          Share the plan URL to connect with collaborators, or download the handoff file to share
          manually.
        </p>
      </div>
      <Button variant="secondary" onPress={onDownload} isDisabled={isHandingOff}>
        {isHandingOff ? (
          <>
            <Spinner size="sm" color="current" />
            Preparing handoff...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download Handoff File
          </>
        )}
      </Button>
    </div>
  );
}

function FilePickerState({
  onFileSelect,
  isLoading,
}: {
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center">
        <Upload className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Select your conversation file</p>
        <p className="text-xs text-muted-foreground mt-1">
          Choose your Claude Code session file (.jsonl) or a previously downloaded handoff file
          (.a2a.json)
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".jsonl,.json,.a2a.json"
        onChange={onFileSelect}
        className="hidden"
      />
      <Button
        variant="secondary"
        onPress={() => fileInputRef.current?.click()}
        isDisabled={isLoading}
      >
        {isLoading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
        Select File
      </Button>
    </div>
  );
}

export function HandoffConversationDialog({
  planId,
  ydoc,
  rtcProvider,
  isOpen,
  onClose,
  hasOriginTranscript,
}: HandoffConversationDialogProps) {
  const { connectedPeers, peerCount } = useP2PPeers(rtcProvider);
  const { exportToFile, sendToPeer, progress, isProcessing } = useConversationTransfer(
    planId,
    ydoc,
    rtcProvider
  );
  const { actor } = useUserIdentity();
  const [_selectedPeer, setSelectedPeer] = useState<ConnectedPeer | null>(null);

  const [transcriptContent, setTranscriptContent] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      setTranscriptContent(null);
      setTranscriptError(null);
      return;
    }

    if (hasOriginTranscript && !transcriptContent) {
      setIsLoadingTranscript(true);
      setTranscriptError(null);

      fetch(`http://localhost:32191/api/plan/${planId}/transcript`)
        .then((res) => {
          if (res.ok) return res.text();
          throw new Error('Failed to fetch transcript');
        })
        .then((content) => {
          setTranscriptContent(content);
        })
        .catch((err) => {
          setTranscriptError(err.message || 'Failed to load transcript');
        })
        .finally(() => {
          setIsLoadingTranscript(false);
        });
    }
  }, [isOpen, hasOriginTranscript, planId, transcriptContent]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setTranscriptContent(reader.result as string);
      setTranscriptError(null);
    };
    reader.onerror = () => {
      setTranscriptError('Failed to read file');
    };
    reader.readAsText(file);
  }

  function handleRetryFetch() {
    setTranscriptError(null);
    setIsLoadingTranscript(true);

    fetch(`http://localhost:32191/api/plan/${planId}/transcript`)
      .then((res) => {
        if (res.ok) return res.text();
        throw new Error('Failed to fetch transcript');
      })
      .then((content) => {
        setTranscriptContent(content);
      })
      .catch((err) => {
        setTranscriptError(err.message || 'Failed to load transcript');
      })
      .finally(() => {
        setIsLoadingTranscript(false);
      });
  }

  async function handleDownloadHandoff() {
    if (!transcriptContent) {
      toast.error('No transcript content available');
      return;
    }

    const result = await exportToFile(transcriptContent);

    if (result.success) {
      // Log conversation export event
      logPlanEvent(ydoc, 'conversation_exported', actor, {
        messageCount: result.messageCount,
      });

      toast.success(`Handed off ${result.messageCount} messages to ${result.filename}`);
      onClose();
    } else {
      toast.error(result.error ?? 'Handoff failed');
    }
  }

  async function handlePeerTransfer(peer: ConnectedPeer) {
    if (!transcriptContent) {
      toast.error('No transcript content available');
      return;
    }

    setSelectedPeer(peer);

    try {
      const { parseClaudeCodeTranscriptString, claudeCodeToA2A } = await import(
        '@peer-plan/schema'
      );
      const parseResult = parseClaudeCodeTranscriptString(transcriptContent);

      if (parseResult.messages.length === 0) {
        toast.error('No messages found in transcript');
        setSelectedPeer(null);
        return;
      }

      const a2aMessages = claudeCodeToA2A(parseResult.messages, planId);

      if (!peer.webrtcPeerId) {
        toast.error('Peer connection not ready. Try again in a moment.');
        setSelectedPeer(null);
        return;
      }
      const success = await sendToPeer(peer.webrtcPeerId, a2aMessages, {
        onComplete: () => {
          const versions = getConversationVersions(ydoc);
          const myVersion = versions.find((v) => !v.handedOff);
          if (myVersion) {
            markVersionHandedOff(ydoc, myVersion.versionId, peer.name);
          }

          logPlanEvent(ydoc, 'conversation_handed_off', actor, {
            handedOffTo: peer.name,
            messageCount: a2aMessages.length,
          });

          toast.success(`Handed off ${a2aMessages.length} messages to ${peer.name}`);
          onClose();
        },
        onError: (error) => {
          toast.error(`Transfer failed: ${error.message}`);
        },
      });

      if (!success) {
        toast.error('Failed to initiate P2P transfer');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setSelectedPeer(null);
    }
  }

  const progressPercent = progress
    ? progress.stage === 'transferring'
      ? progress.percentage
      : progress.stage === 'done'
        ? 100
        : (progress.current / progress.total) * 100
    : 0;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[400px]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Handoff Conversation</Modal.Heading>
            <p className="text-sm leading-5 text-muted-foreground">
              Transfer your conversation context to another agent platform
            </p>
          </Modal.Header>

          <Modal.Body className="p-4">
            {/* Loading state */}
            {isLoadingTranscript && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Spinner size="lg" />
                <p className="text-sm text-muted-foreground">Loading transcript...</p>
              </div>
            )}

            {/* Error state */}
            {transcriptError && !isLoadingTranscript && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
                  <X className="w-8 h-8 text-danger" />
                </div>
                <p className="text-sm text-danger">{transcriptError}</p>
                {hasOriginTranscript && (
                  <Button variant="secondary" onPress={handleRetryFetch}>
                    Retry
                  </Button>
                )}
              </div>
            )}

            {/* File picker for non-owners (no origin transcript) */}
            {!hasOriginTranscript && !transcriptContent && !isLoadingTranscript && (
              <FilePickerState onFileSelect={handleFileSelect} isLoading={false} />
            )}

            {/* Has transcript - show handoff options */}
            {transcriptContent && !isLoadingTranscript && (
              <>
                {/* Progress indicator */}
                {isProcessing && progress && (
                  <div className="mb-4">
                    <ProgressBar progress={progressPercent} stage={progress.stage} />
                  </div>
                )}

                {/* Connected peers list */}
                {!isProcessing && peerCount > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Send to a connected peer or download as file:
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {connectedPeers.map((peer) => (
                        <PeerCard
                          key={peer.webrtcPeerId ?? `${peer.name}-${peer.connectedAt}`}
                          peer={peer}
                          onSelect={() => handlePeerTransfer(peer)}
                          isDisabled={isProcessing || !peer.webrtcPeerId}
                        />
                      ))}
                    </div>
                    <div className="pt-2 border-t border-separator">
                      <Button
                        variant="tertiary"
                        fullWidth
                        onPress={handleDownloadHandoff}
                        isDisabled={isProcessing}
                      >
                        <Download className="w-4 h-4" />
                        Download as File Instead
                      </Button>
                    </div>
                  </div>
                )}

                {/* No peers - show download option */}
                {!isProcessing && peerCount === 0 && (
                  <NoPeersState onDownload={handleDownloadHandoff} isHandingOff={isProcessing} />
                )}
              </>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button slot="close" variant="secondary">
              Cancel
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
