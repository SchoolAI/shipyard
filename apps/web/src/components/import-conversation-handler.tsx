/**
 * ImportConversationHandler - Components for importing A2A conversations
 *
 * Provides UI for importing .a2a.json conversation files:
 * - ImportConversationButton: Icon button that opens file picker
 * - ImportReviewModal: Modal for reviewing imported conversation before confirming
 *
 * The imported conversation can be used to:
 * 1. Resume a handed-off conversation from another agent
 * 2. Start a new agent with context from the imported conversation
 */

import { Button, Card, Modal, Spinner } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Check, MessageSquare, MessageSquareReply } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import {
  type A2AMessage,
  type ConversationExportMeta,
  type ImportResult,
  useConversationTransfer,
} from '@/hooks/use-conversation-transfer';
import { useTaskDocument } from '@/loro/use-task-document';

interface ImportConversationButtonProps {
  /** Task ID for logging import events */
  taskId: TaskId;
  /** Called when import is confirmed with messages and metadata */
  onImportConfirmed?: (messages: A2AMessage[], meta: ConversationExportMeta) => void;
}

/**
 * Renders a single message preview in the import review modal.
 */
function MessagePreview({ message }: { message: A2AMessage }) {
  const isUser = message.role === 'user';
  const firstTextPart = message.parts.find((p) => p.type === 'text');
  const text =
    firstTextPart && 'text' in firstTextPart ? (firstTextPart.text ?? '') : '[Non-text content]';
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
 * Modal for reviewing imported conversation before confirming.
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
            <Modal.Heading>Resume Conversation</Modal.Heading>
            <p className="text-sm leading-5 text-muted-foreground">{summary.title}</p>
          </Modal.Header>

          <Modal.Body className="p-4">
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
 * Button that opens file picker for importing A2A conversation files.
 * Shows review modal before confirming the import.
 */
export function ImportConversationButton({
  taskId,
  onImportConfirmed,
}: ImportConversationButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [importedData, setImportedData] = useState<ImportResult | null>(null);
  const taskDoc = useTaskDocument(taskId);

  const { importFromFile, isProcessing } = useConversationTransfer(taskId);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value to allow re-selecting the same file
    event.target.value = '';

    const result = await importFromFile(file);

    if (result.success) {
      setImportedData(result);
      setIsReviewOpen(true);
    } else {
      toast.error(result.error);
    }
  }

  function handleConfirmImport() {
    if (importedData?.success) {
      // Log the import event using agent_activity event type
      const actor = taskDoc.meta.ownerId || 'unknown';
      taskDoc.logEvent('agent_activity', actor, {
        message: `Imported conversation from ${importedData.meta.sourcePlatform} (${importedData.meta.messageCount} messages)`,
        isBlocker: false,
      });

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
      />

      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={() => fileInputRef.current?.click()}
        isDisabled={isProcessing}
        aria-label="Resume conversation from file"
        className="touch-target"
      >
        {isProcessing ? (
          <Spinner size="sm" color="current" />
        ) : (
          <MessageSquareReply className="w-4 h-4" />
        )}
      </Button>

      {importedData?.success && (
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
 * Hook result type for the file input ref and handlers.
 */
export interface UseImportConversationResult {
  /** Ref for hidden file input */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Handle file selection */
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  /** Review modal state */
  isReviewOpen: boolean;
  /** Set review modal state */
  setIsReviewOpen: (open: boolean) => void;
  /** Import result data */
  importedData: ImportResult | null;
  /** Clear import data */
  clearImportData: () => void;
  /** Confirm import */
  handleConfirmImport: () => void;
  /** Whether processing */
  isProcessing: boolean;
}

/**
 * Hook for implementing custom import button UI.
 * Use this when you need more control over the import trigger.
 */
export function useImportConversation(
  taskId: TaskId,
  onImportConfirmed?: (messages: A2AMessage[], meta: ConversationExportMeta) => void
): UseImportConversationResult {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [importedData, setImportedData] = useState<ImportResult | null>(null);
  const taskDoc = useTaskDocument(taskId);

  const { importFromFile, isProcessing } = useConversationTransfer(taskId);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    const result = await importFromFile(file);

    if (result.success) {
      setImportedData(result);
      setIsReviewOpen(true);
    } else {
      toast.error(result.error);
    }
  }

  function handleConfirmImport() {
    if (importedData?.success) {
      // Log the import event using agent_activity event type
      const actor = taskDoc.meta.ownerId || 'unknown';
      taskDoc.logEvent('agent_activity', actor, {
        message: `Imported conversation from ${importedData.meta.sourcePlatform} (${importedData.meta.messageCount} messages)`,
        isBlocker: false,
      });

      onImportConfirmed?.(importedData.messages, importedData.meta);
      toast.success(`Imported ${importedData.meta.messageCount} messages`);
    }
    setIsReviewOpen(false);
    setImportedData(null);
  }

  function clearImportData() {
    setIsReviewOpen(false);
    setImportedData(null);
  }

  return {
    fileInputRef,
    handleFileSelect,
    isReviewOpen,
    setIsReviewOpen,
    importedData,
    clearImportData,
    handleConfirmImport,
    isProcessing,
  };
}

// Re-export the modal for use in custom implementations
export { ImportReviewModal };
