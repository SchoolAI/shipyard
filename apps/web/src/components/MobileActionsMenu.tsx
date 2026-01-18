import { Avatar, Button, Card, Dropdown, Label, Modal } from '@heroui/react';
import type { A2AMessage, ConversationExportMeta, PlanMetadata } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import {
  Archive,
  ArchiveRestore,
  Check,
  FileInput,
  GitPullRequest,
  MessageSquare,
  MessageSquareShare,
  MoreVertical,
  Share2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { HandoffConversationDialog } from '@/components/HandoffConversationDialog';
import { LinkPRButton } from '@/components/LinkPRButton';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useConversationTransfer } from '@/hooks/useConversationTransfer';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';

// ============================================================================
// Helper Functions & Sub-Components
// ============================================================================

/** Extract text preview from a message */
function getMessageTextPreview(msg: A2AMessage, maxLength = 150): string {
  const firstTextPart = msg.parts.find((p) => p.type === 'text');
  const text = firstTextPart && 'text' in firstTextPart ? firstTextPart.text : '[Non-text content]';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

// Note: Avatar compound components have type issues in HeroUI v3 beta
// Using type assertions until types are fixed in stable release
const AvatarRoot = Avatar as unknown as React.FC<{
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'accent';
  className?: string;
}>;
const AvatarFallback = Avatar.Fallback as React.FC<{ children: React.ReactNode }>;

/** Props for the message preview item */
interface MessagePreviewItemProps {
  msg: A2AMessage;
  idx: number;
}

/** Renders a single message preview in the import review modal */
function MessagePreviewItem({ msg, idx }: MessagePreviewItemProps) {
  const isUser = msg.role === 'user';
  const preview = getMessageTextPreview(msg);

  return (
    <div key={msg.messageId || idx} className={`flex gap-2 ${isUser ? '' : 'flex-row-reverse'}`}>
      <AvatarRoot size="sm" color={isUser ? 'default' : 'accent'}>
        <AvatarFallback>{isUser ? 'U' : 'A'}</AvatarFallback>
      </AvatarRoot>
      <div
        className={`flex-1 p-2 rounded-lg text-sm ${
          isUser ? 'bg-surface-secondary' : 'bg-accent/10'
        }`}
      >
        <p className="text-muted-foreground text-xs mb-1">{isUser ? 'User' : 'Agent'}</p>
        <p className="text-foreground">{preview}</p>
      </div>
    </div>
  );
}

/** Data structure for mobile import review */
interface MobileImportData {
  messages: A2AMessage[];
  meta: ConversationExportMeta;
  summary: { title: string; text: string };
}

/** Props for import review modal */
interface ImportReviewModalProps {
  importData: MobileImportData;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal for reviewing imported conversation before confirming */
function ImportReviewModal({
  importData,
  isOpen,
  onOpenChange,
  onConfirm,
  onCancel,
}: ImportReviewModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <MessageSquare className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Review Imported Conversation</Modal.Heading>
            <p className="text-sm leading-5 text-muted-foreground">{importData.summary.title}</p>
          </Modal.Header>

          <Modal.Body className="p-4">
            {/* Metadata summary */}
            <Card variant="secondary" className="mb-4">
              <Card.Content className="p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Source:</span>{' '}
                    <span className="text-foreground">{importData.meta.sourcePlatform}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Messages:</span>{' '}
                    <span className="text-foreground">{importData.meta.messageCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Exported:</span>{' '}
                    <span className="text-foreground">
                      {new Date(importData.meta.exportedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Session:</span>{' '}
                    <span className="text-foreground font-mono text-xs">
                      {importData.meta.sourceSessionId.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </Card.Content>
            </Card>

            {/* Message preview */}
            <p className="text-sm text-muted-foreground mb-3">Conversation preview:</p>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {importData.messages.slice(0, 5).map((msg, idx) => (
                <MessagePreviewItem key={msg.messageId || idx} msg={msg} idx={idx} />
              ))}
              {importData.messages.length > 5 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  ... and {importData.messages.length - 5} more messages
                </p>
              )}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onPress={onCancel}>
              Cancel
            </Button>
            <Button onPress={onConfirm}>
              <Check className="w-4 h-4" />
              Import Conversation
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface MobileActionsMenuProps {
  planId: string;
  ydoc: Y.Doc;
  rtcProvider: WebrtcProvider | null;
  metadata: PlanMetadata;
}

/**
 * Mobile dropdown menu with all plan actions (share, import, handoff, link PR, archive).
 * Designed for use in MobileHeader as a replacement for individual action buttons.
 */
export function MobileActionsMenu({ planId, ydoc, rtcProvider, metadata }: MobileActionsMenuProps) {
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const isArchived = !!metadata.archivedAt;
  const { actor } = useUserIdentity();

  // Handoff conversation dialog state
  const [isHandoffDialogOpen, setIsHandoffDialogOpen] = useState(false);

  // Link PR popover state
  const [isLinkPROpen, setIsLinkPROpen] = useState(false);

  // File input ref for import
  const importInputRef = useRef<HTMLInputElement>(null);

  // Conversation transfer hook for import
  const { importFromFile } = useConversationTransfer(planId, ydoc, rtcProvider);

  // State for import review modal
  const [importData, setImportData] = useState<MobileImportData | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Check if this plan has an origin transcript (can be handed off)
  const hasOriginTranscript = Boolean(
    metadata.origin?.platform === 'claude-code' && metadata.origin.transcriptPath
  );

  const handleArchiveToggle = () => {
    const now = Date.now();

    ydoc.transact(
      () => {
        const metadataMap = ydoc.getMap('metadata');
        if (isArchived) {
          metadataMap.delete('archivedAt');
          metadataMap.delete('archivedBy');
        } else {
          metadataMap.set('archivedAt', now);
          metadataMap.set('archivedBy', actor);
        }
        metadataMap.set('updatedAt', now);
      },
      { actor }
    );

    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      if (isArchived) {
        setPlanIndexEntry(indexDoc, {
          id: entry.id,
          title: entry.title,
          status: entry.status,
          createdAt: entry.createdAt,
          updatedAt: now,
          ownerId: entry.ownerId,
          deleted: false,
        });
        toast.success('Plan unarchived');
      } else {
        setPlanIndexEntry(indexDoc, {
          id: entry.id,
          title: entry.title,
          status: entry.status,
          createdAt: entry.createdAt,
          updatedAt: now,
          ownerId: entry.ownerId,
          deleted: true,
          deletedAt: now,
          deletedBy: actor,
        });
        toast.success('Plan archived');
      }
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Link copied to clipboard');
    }
  };

  const handleDropdownAction = (key: React.Key) => {
    switch (key) {
      case 'share':
        handleShare();
        break;
      case 'import':
        importInputRef.current?.click();
        break;
      case 'handoff':
        setIsHandoffDialogOpen(true);
        break;
      case 'link-pr':
        setIsLinkPROpen(true);
        break;
      case 'archive':
      case 'unarchive':
        handleArchiveToggle();
        break;
    }
  };

  /**
   * Handle file import selection.
   */
  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = '';

    const result = await importFromFile(file);

    if (result.success) {
      setImportData({
        messages: result.messages,
        meta: result.meta,
        summary: result.summary,
      });
      setIsReviewOpen(true);
    } else {
      toast.error(result.error);
    }
  }

  /**
   * Confirm import.
   */
  function handleImportConfirm() {
    if (importData) {
      toast.success(`Imported ${importData.meta.messageCount} messages`);
    }
    setIsReviewOpen(false);
    setImportData(null);
  }

  return (
    <>
      <Dropdown>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="More actions"
          className="touch-target"
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu onAction={handleDropdownAction}>
            <Dropdown.Item id="share" textValue="Share">
              <Share2 className="w-4 h-4 shrink-0 text-muted" />
              <Label>Share</Label>
            </Dropdown.Item>

            <Dropdown.Item id="import" textValue="Import conversation">
              <FileInput className="w-4 h-4 shrink-0 text-muted" />
              <Label>Import conversation</Label>
            </Dropdown.Item>

            {hasOriginTranscript && (
              <Dropdown.Item id="handoff" textValue="Handoff conversation">
                <MessageSquareShare className="w-4 h-4 shrink-0 text-muted" />
                <Label>Handoff conversation</Label>
              </Dropdown.Item>
            )}

            <Dropdown.Item id="link-pr" textValue="Link PR">
              <GitPullRequest className="w-4 h-4 shrink-0 text-muted" />
              <Label>Link PR</Label>
            </Dropdown.Item>

            <Dropdown.Item
              id={isArchived ? 'unarchive' : 'archive'}
              textValue={isArchived ? 'Unarchive' : 'Archive'}
            >
              {isArchived ? (
                <ArchiveRestore className="w-4 h-4 shrink-0 text-muted" />
              ) : (
                <Archive className="w-4 h-4 shrink-0 text-muted" />
              )}
              <Label>{isArchived ? 'Unarchive' : 'Archive'}</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      {/* Handoff conversation dialog */}
      <HandoffConversationDialog
        planId={planId}
        ydoc={ydoc}
        rtcProvider={rtcProvider}
        isOpen={isHandoffDialogOpen}
        onClose={() => setIsHandoffDialogOpen(false)}
        hasOriginTranscript={hasOriginTranscript}
      />

      {/* Link PR popover - button hidden, but popover still works when triggered from dropdown */}
      <div className="hidden">
        <LinkPRButton ydoc={ydoc} isOpen={isLinkPROpen} onOpenChange={setIsLinkPROpen} />
      </div>

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.a2a.json"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Import conversation file"
      />

      {/* Import review modal */}
      {importData && (
        <ImportReviewModal
          importData={importData}
          isOpen={isReviewOpen}
          onOpenChange={(open) => !open && setIsReviewOpen(false)}
          onConfirm={handleImportConfirm}
          onCancel={() => {
            setIsReviewOpen(false);
            setImportData(null);
          }}
        />
      )}
    </>
  );
}
