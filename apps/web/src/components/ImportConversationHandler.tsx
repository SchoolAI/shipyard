/**
 * Handler component for importing conversation context.
 *
 * Features:
 * - File input for importing A2A conversation files
 * - Review modal to preview imported conversation
 * - Toast notifications for P2P received conversations (Phase 3)
 *
 * @see Issue #41 - Context Teleportation
 */

import { Avatar, Button, Card, Modal, Spinner } from '@heroui/react';
import type { A2AMessage, ConversationExportMeta } from '@peer-plan/schema';
import { Check, FileText, MessageSquare, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import {
  type ImportResult,
  type ReceivedConversation,
  useConversationTransfer,
} from '@/hooks/useConversationTransfer';

interface ImportConversationHandlerProps {
  /** Plan ID */
  planId: string;
  /** Y.Doc for the plan */
  ydoc: Y.Doc;
  /** WebRTC provider */
  rtcProvider: WebrtcProvider | null;
  /** Called when import is confirmed */
  onImportConfirmed?: (messages: A2AMessage[], meta: ConversationExportMeta) => void;
  /** Children to render (e.g., import button) */
  children?: React.ReactNode;
}

/**
 * Message preview card for the review modal.
 */
function MessagePreview({ message }: { message: A2AMessage }) {
  const isUser = message.role === 'user';
  const firstTextPart = message.parts.find((p) => p.type === 'text');
  const text = firstTextPart && 'text' in firstTextPart ? firstTextPart.text : '[Non-text content]';
  const preview = text.length > 150 ? `${text.slice(0, 150)}...` : text;

  return (
    <div className={`flex gap-2 ${isUser ? '' : 'flex-row-reverse'}`}>
      <Avatar size="sm" color={isUser ? 'default' : 'accent'}>
        <Avatar.Fallback>{isUser ? 'U' : 'A'}</Avatar.Fallback>
      </Avatar>
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

/**
 * Review modal for previewing imported conversation before confirming.
 */
function ImportReviewModal({
  isOpen,
  onClose,
  messages,
  meta,
  summary,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  messages: A2AMessage[];
  meta: ConversationExportMeta;
  summary: { title: string; text: string };
  onConfirm: () => void;
}) {
  const previewMessages = messages.slice(0, 5);
  const hasMore = messages.length > 5;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <MessageSquare className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Review Imported Conversation</Modal.Heading>
            <p className="text-sm leading-5 text-muted-foreground">{summary.title}</p>
          </Modal.Header>

          <Modal.Body className="p-4">
            {/* Metadata summary */}
            <Card variant="secondary" className="mb-4">
              <Card.Content className="p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Source:</span>{' '}
                    <span className="text-foreground">{meta.sourcePlatform}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Messages:</span>{' '}
                    <span className="text-foreground">{meta.messageCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Exported:</span>{' '}
                    <span className="text-foreground">
                      {new Date(meta.exportedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Session:</span>{' '}
                    <span className="text-foreground font-mono text-xs">
                      {meta.sourceSessionId.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </Card.Content>
            </Card>

            {/* Message preview */}
            <p className="text-sm text-muted-foreground mb-3">Conversation preview:</p>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {previewMessages.map((msg, idx) => (
                <MessagePreview key={msg.messageId || idx} message={msg} />
              ))}
              {hasMore && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  ... and {messages.length - 5} more messages
                </p>
              )}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onPress={onClose}>
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

/**
 * Import button with file input handling.
 */
export function ImportConversationButton({
  planId,
  ydoc,
  rtcProvider,
  onImportConfirmed,
}: Omit<ImportConversationHandlerProps, 'children'>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [importedData, setImportedData] = useState<ImportResult | null>(null);

  const { importFromFile, isProcessing } = useConversationTransfer(planId, ydoc, rtcProvider);

  /**
   * Handle file selection.
   */
  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = '';

    const result = await importFromFile(file);

    if (result.success && result.messages && result.meta && result.summary) {
      setImportedData(result);
      setIsReviewOpen(true);
    } else {
      toast.error(result.error ?? 'Import failed');
    }
  }

  /**
   * Confirm import and notify parent.
   */
  function handleConfirmImport() {
    if (importedData?.messages && importedData?.meta) {
      onImportConfirmed?.(importedData.messages, importedData.meta);
      toast.success(`Imported ${importedData.meta.messageCount} messages`);
    }
    setIsReviewOpen(false);
    setImportedData(null);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.a2a.json"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Import conversation file"
      />

      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={() => fileInputRef.current?.click()}
        isDisabled={isProcessing}
        aria-label="Import conversation from file"
        className="touch-target"
      >
        {isProcessing ? <Spinner size="sm" color="current" /> : <Upload className="w-4 h-4" />}
      </Button>

      {/* Review modal */}
      {importedData?.messages && importedData?.meta && importedData?.summary && (
        <ImportReviewModal
          isOpen={isReviewOpen}
          onClose={() => {
            setIsReviewOpen(false);
            setImportedData(null);
          }}
          messages={importedData.messages}
          meta={importedData.meta}
          summary={importedData.summary}
          onConfirm={handleConfirmImport}
        />
      )}
    </>
  );
}

/**
 * Hook to show toast notification when conversation is received via P2P.
 * Tracks shown conversations to avoid duplicate toasts.
 */
export function useImportConversationToast(
  planId: string,
  ydoc: Y.Doc,
  rtcProvider: WebrtcProvider | null,
  onReviewRequest?: (received: ReceivedConversation) => void
) {
  const { receivedConversations, clearReceived } = useConversationTransfer(
    planId,
    ydoc,
    rtcProvider
  );

  // Track which conversations we've shown toasts for
  const shownToastsRef = useRef<Set<string>>(new Set());

  // Show toast for each new received conversation
  useEffect(() => {
    for (const received of receivedConversations) {
      const toastKey = `${received.meta.exportId}-${received.receivedAt}`;

      // Skip if we've already shown a toast for this conversation
      if (shownToastsRef.current.has(toastKey)) {
        continue;
      }

      // Mark as shown
      shownToastsRef.current.add(toastKey);

      // Show toast with action to review
      toast.info(
        `Received conversation from ${received.meta.sourcePlatform} (${received.meta.messageCount} messages)`,
        {
          duration: 10000,
          action: {
            label: 'Review',
            onClick: () => {
              onReviewRequest?.(received);
            },
          },
        }
      );
    }
  }, [receivedConversations, onReviewRequest]);

  return { receivedConversations, clearReceived };
}

/**
 * Received conversation type - re-exported for convenience.
 */
export type { ReceivedConversation } from '@/hooks/useConversationTransfer';

/**
 * Modal for reviewing a P2P received conversation.
 */
function ReceivedReviewModal({
  isOpen,
  onClose,
  received,
  onConfirm,
  onDownload,
}: {
  isOpen: boolean;
  onClose: () => void;
  received: ReceivedConversation;
  onConfirm: () => void;
  onDownload: () => void;
}) {
  const { messages, meta, summary } = received;
  const previewMessages = messages.slice(0, 5);
  const hasMore = messages.length > 5;

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className="bg-success-soft text-success-soft-foreground">
              <MessageSquare className="size-5" />
            </Modal.Icon>
            <Modal.Heading>Received Conversation</Modal.Heading>
            <p className="text-sm leading-5 text-muted-foreground">{summary.title}</p>
          </Modal.Header>

          <Modal.Body className="p-4">
            {/* Metadata summary */}
            <Card variant="secondary" className="mb-4">
              <Card.Content className="p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Source:</span>{' '}
                    <span className="text-foreground">{meta.sourcePlatform}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Messages:</span>{' '}
                    <span className="text-foreground">{meta.messageCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Received:</span>{' '}
                    <span className="text-foreground">
                      {new Date(received.receivedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Session:</span>{' '}
                    <span className="text-foreground font-mono text-xs">
                      {meta.sourceSessionId.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </Card.Content>
            </Card>

            {/* Message preview */}
            <p className="text-sm text-muted-foreground mb-3">Conversation preview:</p>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {previewMessages.map((msg, idx) => (
                <MessagePreview key={msg.messageId || idx} message={msg} />
              ))}
              {hasMore && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  ... and {messages.length - 5} more messages
                </p>
              )}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onPress={onClose}>
              Dismiss
            </Button>
            <Button variant="secondary" onPress={onDownload}>
              <FileText className="w-4 h-4" />
              Download
            </Button>
            <Button onPress={onConfirm}>
              <Check className="w-4 h-4" />
              Accept
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/**
 * Full handler component for importing conversations.
 *
 * This component:
 * - Shows toast notifications when conversations are received via P2P
 * - Provides a review modal to preview and accept/download conversations
 *
 * Render this component in PlanPage to enable P2P conversation receive notifications.
 */
export function ImportConversationHandler({
  planId,
  ydoc,
  rtcProvider,
  onImportConfirmed,
}: {
  planId: string;
  ydoc: Y.Doc;
  rtcProvider: WebrtcProvider | null;
  onImportConfirmed?: (messages: A2AMessage[], meta: ConversationExportMeta) => void;
}) {
  const [selectedReceived, setSelectedReceived] = useState<ReceivedConversation | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Hook into P2P receive notifications
  const { receivedConversations, clearReceived } = useImportConversationToast(
    planId,
    ydoc,
    rtcProvider,
    (received) => {
      // When user clicks "Review" on toast, open the modal
      setSelectedReceived(received);
      setIsReviewOpen(true);
    }
  );

  /**
   * Handle confirm/accept - notify parent and close modal.
   */
  function handleConfirm() {
    if (selectedReceived) {
      onImportConfirmed?.(selectedReceived.messages, selectedReceived.meta);
      toast.success(
        `Accepted ${selectedReceived.meta.messageCount} messages from ${selectedReceived.meta.sourcePlatform}`
      );
    }
    setIsReviewOpen(false);
    setSelectedReceived(null);
  }

  /**
   * Handle download - save as .a2a.json file.
   */
  function handleDownload() {
    if (!selectedReceived) return;

    const exportPackage = {
      meta: selectedReceived.meta,
      messages: selectedReceived.messages,
    };

    const jsonString = JSON.stringify(exportPackage, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `conversation-${selectedReceived.meta.planId.slice(0, 8)}-${Date.now()}.a2a.json`;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);

    toast.success(`Downloaded conversation as ${filename}`);
  }

  /**
   * Handle close - just close the modal without action.
   */
  function handleClose() {
    setIsReviewOpen(false);
    setSelectedReceived(null);
  }

  // Render the review modal only when we have a selected conversation
  if (!selectedReceived) {
    return null;
  }

  return (
    <ReceivedReviewModal
      isOpen={isReviewOpen}
      onClose={handleClose}
      received={selectedReceived}
      onConfirm={handleConfirm}
      onDownload={handleDownload}
    />
  );
}
