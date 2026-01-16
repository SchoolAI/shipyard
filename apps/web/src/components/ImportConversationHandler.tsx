import { Avatar, Button, Card, Modal, Spinner } from '@heroui/react';
import {
  type A2AMessage,
  addConversationVersion,
  type ConversationExportMeta,
  type ConversationVersion,
  logPlanEvent,
  type OriginPlatform,
} from '@peer-plan/schema';
import { Check, Download, MessageSquare, MessageSquareReply, Terminal } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import {
  type ImportResult,
  type ReceivedConversation,
  useConversationTransfer,
} from '@/hooks/useConversationTransfer';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';

// Avatar compound components have type issues in HeroUI v3 beta
const AvatarRoot = Avatar as unknown as React.FC<{
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'accent';
}>;
const AvatarFallback = Avatar.Fallback as React.FC<{ children: React.ReactNode }>;

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

    if (result.success && result.messages && result.meta && result.summary) {
      setImportedData(result);
      setIsReviewOpen(true);
    } else {
      toast.error(result.error ?? 'Import failed');
    }
  }

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

  const shownToastsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const received of receivedConversations) {
      const toastKey = `${received.meta.exportId}-${received.receivedAt}`;

      if (shownToastsRef.current.has(toastKey)) {
        continue;
      }

      shownToastsRef.current.add(toastKey);

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

export type { ReceivedConversation } from '@/hooks/useConversationTransfer';

const REGISTRY_URL = 'http://localhost:32191';

interface ImportApiResponse {
  success: boolean;
  sessionId?: string;
  transcriptPath?: string;
  messageCount?: number;
  error?: string;
}

/** Parse API response, returning null with toast on error */
async function parseImportResponse(res: Response): Promise<ImportApiResponse | null> {
  if (res.status === 413) {
    toast.error('Conversation too large. Try downloading instead.');
    return null;
  }

  try {
    return (await res.json()) as ImportApiResponse;
  } catch {
    const message = res.ok
      ? 'Invalid response from server'
      : `Server error (${res.status}). Try downloading instead.`;
    toast.error(message);
    return null;
  }
}

// TODO(#9): Platform detection - Currently hard-coded to only detect Claude Code
// Should detect available platforms (Cursor, Devin, Windsurf, etc.) and show
// appropriate import buttons. See: https://github.com/jacobpetterle/peer-plan/issues/9
function useRegistryAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${REGISTRY_URL}/registry`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!cancelled && res.ok) {
          setAvailable(true);
        }
      } catch {
        if (!cancelled) {
          setAvailable(false);
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}

function ReceivedReviewModal({
  isOpen,
  onClose,
  received,
  onDownload,
  onImportToClaudeCode,
  isImporting,
  registryAvailable,
}: {
  isOpen: boolean;
  onClose: () => void;
  received: ReceivedConversation;
  onDownload: () => void;
  onImportToClaudeCode: () => void;
  isImporting: boolean;
  registryAvailable: boolean;
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
            <Modal.Heading>Resume Handed-Off Conversation</Modal.Heading>
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

            {!registryAvailable && (
              <p className="text-sm text-muted-foreground mt-3 italic">
                Registry server not running. Download file to import manually.
              </p>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button variant="secondary" onPress={onClose}>
              Dismiss
            </Button>
            {/* TODO(#9): Platform-specific import buttons
                Currently only shows "Import to Claude Code" if registry is available.
                Should detect which platforms are running (Cursor, Devin, etc.) and show
                only relevant buttons. See A2A research in docs/research/ */}
            {registryAvailable ? (
              <>
                <Button variant="secondary" onPress={onDownload}>
                  <Download className="w-4 h-4" />
                  Download
                </Button>
                <Button onPress={onImportToClaudeCode} isDisabled={isImporting}>
                  {isImporting ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <Terminal className="w-4 h-4" />
                  )}
                  Import to Claude Code
                </Button>
              </>
            ) : (
              <Button onPress={onDownload}>
                <Download className="w-4 h-4" />
                Download File
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
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
  const [isImporting, setIsImporting] = useState(false);
  const registryAvailable = useRegistryAvailable();
  const { identity } = useGitHubAuth();

  useImportConversationToast(planId, ydoc, rtcProvider, (received) => {
    setSelectedReceived(received);
    setIsReviewOpen(true);
  });

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

  const handleImportToClaudeCode = useCallback(async () => {
    if (!selectedReceived) return;

    setIsImporting(true);

    try {
      const res = await fetch(`${REGISTRY_URL}/api/conversation/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          a2aMessages: selectedReceived.messages,
          meta: selectedReceived.meta,
        }),
      });

      const result = await parseImportResponse(res);
      if (!result) return;

      if (!result.success) {
        toast.error(result.error ?? 'Import failed');
        return;
      }

      // Track conversation import in CRDT
      const newVersion: ConversationVersion = {
        versionId: crypto.randomUUID(),
        creator: identity?.username || 'anonymous',
        platform: (selectedReceived.meta.sourcePlatform || 'unknown') as OriginPlatform,
        sessionId: selectedReceived.meta.sourceSessionId,
        messageCount: selectedReceived.meta.messageCount,
        createdAt: Date.now(),
      };
      addConversationVersion(ydoc, newVersion);

      // Log activity event
      logPlanEvent(ydoc, 'conversation_imported', identity?.username || 'anonymous', {
        sourcePlatform: selectedReceived.meta.sourcePlatform,
        messageCount: selectedReceived.meta.messageCount,
        sourceSessionId: selectedReceived.meta.sourceSessionId.slice(0, 8),
      });

      toast.success(
        `Created Claude Code session: ${result.sessionId}\nPath: ${result.transcriptPath}`,
        { duration: 8000 }
      );

      setIsReviewOpen(false);
      setSelectedReceived(null);
    } catch {
      toast.error('Registry server not available. Download file instead.');
    } finally {
      setIsImporting(false);
    }
  }, [selectedReceived, ydoc, identity?.username]);

  function handleClose() {
    setIsReviewOpen(false);
    setSelectedReceived(null);
  }

  if (!selectedReceived) {
    return null;
  }

  return (
    <ReceivedReviewModal
      isOpen={isReviewOpen}
      onClose={handleClose}
      received={selectedReceived}
      onDownload={handleDownload}
      onImportToClaudeCode={handleImportToClaudeCode}
      isImporting={isImporting}
      registryAvailable={registryAvailable}
    />
  );
}
