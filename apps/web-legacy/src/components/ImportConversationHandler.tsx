import { Button, Card, Modal, Spinner } from '@heroui/react';
import type { A2AMessage, ConversationExportMeta } from '@shipyard/schema';
import { Check, MessageSquare, MessageSquareReply } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { Avatar } from '@/components/ui/avatar';
import {
  type ImportResult,
  type ReceivedConversation,
  useConversationTransfer,
} from '@/hooks/useConversationTransfer';
import { useImportConversationToast } from '@/hooks/useImportConversationToast';
import { StartAgentModal } from './StartAgentModal';

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

export function ImportConversationHandler({
  planId,
  ydoc,
  rtcProvider,
}: {
  planId: string;
  ydoc: Y.Doc;
  rtcProvider: WebrtcProvider | null;
}) {
  const [selectedReceived, setSelectedReceived] = useState<ReceivedConversation | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  useImportConversationToast(planId, ydoc, rtcProvider, (received) => {
    setSelectedReceived(received);
    setIsReviewOpen(true);
  });

  function handleClose() {
    setIsReviewOpen(false);
    setSelectedReceived(null);
  }

  if (!selectedReceived) {
    return null;
  }

  return (
    <StartAgentModal
      isOpen={isReviewOpen}
      onClose={handleClose}
      a2aConversation={{
        messages: selectedReceived.messages,
        meta: selectedReceived.meta,
        summary: selectedReceived.summary,
      }}
    />
  );
}
