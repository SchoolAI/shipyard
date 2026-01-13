/**
 * Dialog for handing off conversation context to another agent platform.
 *
 * Features:
 * - Lists connected P2P peers for direct handoff transfer
 * - Fallback to file download when no peers connected
 * - Progress indicator during handoff
 *
 * @see Issue #41 - Context Teleportation
 */

import { Avatar, Button, Card, Modal, Spinner } from '@heroui/react';
import { Download, Send, Users, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { useConversationTransfer } from '@/hooks/useConversationTransfer';
import { type ConnectedPeer, useP2PPeers } from '@/hooks/useP2PPeers';

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
  /** Raw transcript content to handoff (from origin metadata) */
  transcriptContent: string | null;
}

/**
 * Progress bar component for handoff operations.
 */
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

/**
 * Peer card component for selecting transfer target.
 */
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
        <Avatar size="sm">
          <Avatar.Fallback style={{ backgroundColor: peer.color }}>
            {peer.name.slice(0, 2).toUpperCase()}
          </Avatar.Fallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{peer.name}</p>
          <p className="text-xs text-muted-foreground">{peer.platform}</p>
        </div>
        <Send className="w-4 h-4 text-muted-foreground" />
      </button>
    </Card>
  );
}

/**
 * Empty state when no peers are connected.
 */
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

/**
 * No transcript available state.
 */
function NoTranscriptState() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
        <X className="w-8 h-8 text-warning" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No conversation to handoff</p>
        <p className="text-xs text-muted-foreground mt-1">
          This plan does not have an associated conversation transcript. Handoff is only available
          for plans created from Claude Code sessions.
        </p>
      </div>
    </div>
  );
}

export function HandoffConversationDialog({
  planId,
  ydoc,
  rtcProvider,
  isOpen,
  onClose,
  transcriptContent,
}: HandoffConversationDialogProps) {
  const { connectedPeers, peerCount } = useP2PPeers(rtcProvider);
  const { exportToFile, sendToPeer, progress, isProcessing } = useConversationTransfer(
    planId,
    ydoc,
    rtcProvider
  );
  const [_selectedPeer, setSelectedPeer] = useState<ConnectedPeer | null>(null);

  /**
   * Handle handoff via file download.
   */
  async function handleDownloadHandoff() {
    if (!transcriptContent) {
      toast.error('No transcript content available');
      return;
    }

    const result = await exportToFile(transcriptContent);

    if (result.success) {
      toast.success(`Handed off ${result.messageCount} messages to ${result.filename}`);
      onClose();
    } else {
      toast.error(result.error ?? 'Handoff failed');
    }
  }

  /**
   * Handle P2P transfer to selected peer.
   */
  async function handlePeerTransfer(peer: ConnectedPeer) {
    if (!transcriptContent) {
      toast.error('No transcript content available');
      return;
    }

    setSelectedPeer(peer);

    try {
      // Parse transcript to A2A messages
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

      // Send via P2P
      const success = await sendToPeer(peer.peerId, a2aMessages, {
        onComplete: () => {
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

  // Calculate progress percentage
  const progressPercent = progress ? (progress.current / progress.total) * 100 : 0;

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
            {/* No transcript available */}
            {!transcriptContent && <NoTranscriptState />}

            {/* Has transcript - show handoff options */}
            {transcriptContent && (
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
                          key={peer.peerId}
                          peer={peer}
                          onSelect={() => handlePeerTransfer(peer)}
                          isDisabled={isProcessing}
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
