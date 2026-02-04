/**
 * HandoffConversationDialog - Modal for exporting conversation to another agent
 *
 * Allows users to export a conversation in A2A format for handoff to another
 * agent platform (e.g., Claude Code -> Cursor, Devin, etc.).
 *
 * Features:
 * - Shows conversation metadata
 * - Platform selector for target agent
 * - Generates and downloads .a2a.json file
 * - Logs handoff event to task timeline
 *
 * Note: This is a simplified version without P2P transfer capabilities.
 * The legacy version included WebRTC-based peer-to-peer transfer.
 */

import type { Key } from '@heroui/react';
import { Button, Card, Label, ListBox, Modal, Select, Spinner } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Download, MessageSquareShare, Users, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { useUserIdentity } from '@/contexts/user-identity-context';
import type { A2AMessage, ConversationExportMeta } from '@/hooks/use-conversation-transfer';
import { useConversationTransfer } from '@/hooks/use-conversation-transfer';
import { type ConnectedPeer, useP2PPeers } from '@/hooks/use-p2p-peers';
import { useTaskDocument } from '@/loro/use-task-document';

/**
 * Target platforms for conversation handoff.
 */
const TARGET_PLATFORMS = [
  { key: 'claude-code', label: 'Claude Code' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'devin', label: 'Devin' },
  { key: 'windsurf', label: 'Windsurf' },
  { key: 'cline', label: 'Cline' },
  { key: 'continue', label: 'Continue' },
  { key: 'aider', label: 'Aider' },
  { key: 'codex', label: 'Codex' },
  { key: 'other', label: 'Other' },
] as const;

type TargetPlatform = (typeof TARGET_PLATFORMS)[number]['key'];

/** Type guard to check if a value is a valid TargetPlatform */
function isTargetPlatform(value: unknown): value is TargetPlatform {
  return TARGET_PLATFORMS.some((p) => p.key === value);
}

interface HandoffConversationDialogProps {
  /** Task ID for metadata */
  taskId: TaskId;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** Messages to export (if available) */
  messages?: A2AMessage[];
  /** Source platform (defaults to "claude-code") */
  sourcePlatform?: string;
  /** Source session ID (defaults to taskId) */
  sourceSessionId?: string;
}

/**
 * Progress bar component for export progress.
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
 * State shown when no conversation is available for handoff.
 */
function NoConversationState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center">
        <X className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No conversation available</p>
        <p className="text-xs text-muted-foreground mt-1">
          This task doesn't have a conversation to hand off yet. Start a conversation first, then
          you can hand it off to another agent.
        </p>
      </div>
      <Button variant="secondary" onPress={onClose}>
        Close
      </Button>
    </div>
  );
}

/**
 * State shown when there are no peers connected for P2P transfer.
 */
function NoPeersState({
  onDownload,
  isExporting,
}: {
  onDownload: () => void;
  isExporting: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center">
        <Users className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No peers connected</p>
        <p className="text-xs text-muted-foreground mt-1">
          Share the task URL to connect with collaborators, or download the handoff file to share
          manually.
        </p>
      </div>
      <Button variant="secondary" onPress={onDownload} isDisabled={isExporting}>
        {isExporting ? (
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
 * Card showing a connected peer that can receive the handoff.
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
        <MessageSquareShare className="w-4 h-4 text-muted-foreground" />
      </button>
    </Card>
  );
}

/**
 * Dialog for handing off a conversation to another agent platform.
 */
export function HandoffConversationDialog({
  taskId,
  isOpen,
  onClose,
  messages = [],
  sourcePlatform = 'claude-code',
  sourceSessionId,
}: HandoffConversationDialogProps) {
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>('cursor');
  const taskDoc = useTaskDocument(taskId);
  const { actor } = useUserIdentity();
  const { connectedPeers, peerCount } = useP2PPeers();
  const { exportToFile, progress, isProcessing } = useConversationTransfer(taskId);

  const hasMessages = messages.length > 0;

  const progressPercent = progress
    ? progress.stage === 'done'
      ? 100
      : (progress.current / progress.total) * 100
    : 0;

  async function handleDownloadHandoff() {
    if (!hasMessages) {
      toast.error('No conversation to hand off');
      return;
    }

    const meta: Omit<ConversationExportMeta, 'exportId' | 'exportedAt'> = {
      sourcePlatform,
      sourceSessionId: sourceSessionId || taskId,
      planId: taskId,
      messageCount: messages.length,
    };

    const result = await exportToFile(messages, meta);

    if (result.success) {
      // Log the handoff event using agent_activity event type
      taskDoc.logEvent('agent_activity', actor || 'unknown', {
        message: `Exported conversation for handoff to ${targetPlatform} (${result.messageCount} messages)`,
        isBlocker: null,
      });

      toast.success(`Handed off ${result.messageCount} messages to ${result.filename}`);
      onClose();
    } else {
      toast.error(result.error ?? 'Handoff failed');
    }
  }

  function handlePeerSelect(_peer: ConnectedPeer) {
    // P2P transfer not implemented in this simplified version
    // For now, just download the file
    toast.info('P2P transfer coming soon. Using file download instead.');
    handleDownloadHandoff();
  }

  function handlePlatformChange(key: Key | null) {
    if (key && isTargetPlatform(key)) {
      setTargetPlatform(key);
    }
  }

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
            {/* No conversation state */}
            {!hasMessages && <NoConversationState onClose={onClose} />}

            {/* Has conversation - show handoff options */}
            {hasMessages && (
              <>
                {/* Conversation summary */}
                <Card variant="secondary" className="mb-4">
                  <Card.Content className="p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span>{' '}
                        <span className="text-foreground">{sourcePlatform}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Messages:</span>{' '}
                        <span className="text-foreground">{messages.length}</span>
                      </div>
                    </div>
                  </Card.Content>
                </Card>

                {/* Target platform selector - HeroUI v3 compound pattern */}
                <div className="mb-4">
                  <Select
                    className="w-full"
                    value={targetPlatform}
                    onChange={handlePlatformChange}
                    isDisabled={isProcessing}
                  >
                    <Label>Target Platform</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {TARGET_PLATFORMS.map((platform) => (
                          <ListBox.Item
                            key={platform.key}
                            id={platform.key}
                            textValue={platform.label}
                          >
                            {platform.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

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
                          onSelect={() => handlePeerSelect(peer)}
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
                  <NoPeersState onDownload={handleDownloadHandoff} isExporting={isProcessing} />
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
