import {
  Avatar,
  Button,
  Card,
  Chip,
  Dropdown,
  Label,
  Modal,
  Separator,
  Tooltip,
} from '@heroui/react';
import type { A2AMessage, ConversationExportMeta, PlanMetadata } from '@peer-plan/schema';
import {
  getPlanIndexEntry,
  getPlanOwnerId,
  getTranscriptContent,
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import {
  Archive,
  ArchiveRestore,
  Check,
  GitPullRequest,
  MessageSquare,
  MessageSquareShare,
  MoreVertical,
  Share2,
  Upload,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { ApprovalPanel } from '@/components/ApprovalPanel';
import { HandoffConversationDialog } from '@/components/HandoffConversationDialog';
import { ImportConversationButton } from '@/components/ImportConversationHandler';
import { LinkPRButton } from '@/components/LinkPRButton';
import { ReviewActions } from '@/components/ReviewActions';
import { ShareButton } from '@/components/ShareButton';
import { StatusChip } from '@/components/StatusChip';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useConversationTransfer } from '@/hooks/useConversationTransfer';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useIsMobile } from '@/hooks/useIsMobile';
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

/** Props for the presence indicators */
interface PresenceIndicatorsProps {
  activeCount: number;
  peerCount: number;
}

/** Renders agent and peer presence indicators */
function _PresenceIndicators({ activeCount, peerCount }: PresenceIndicatorsProps) {
  return (
    <>
      {activeCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          {activeCount} {activeCount === 1 ? 'agent' : 'agents'}
        </span>
      )}
      {peerCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-info" />
          {peerCount} {peerCount === 1 ? 'peer' : 'peers'}
        </span>
      )}
    </>
  );
}

/** Props for desktop action buttons */
interface DesktopActionsProps {
  planId: string;
  ydoc: Y.Doc;
  rtcProvider: WebrtcProvider | null;
  isOwner: boolean;
  hasOriginTranscript: boolean;
  isArchived: boolean;
  isLinkPROpen: boolean;
  onLinkPROpenChange: (open: boolean) => void;
  onHandoffDialogOpen: () => void;
  onArchiveToggle: () => void;
}

/** Desktop action buttons (share, import, handoff, link PR, archive) */
function _DesktopActions({
  planId,
  ydoc,
  rtcProvider,
  isOwner,
  hasOriginTranscript,
  isArchived,
  isLinkPROpen,
  onLinkPROpenChange,
  onHandoffDialogOpen,
  onArchiveToggle,
}: DesktopActionsProps) {
  return (
    <div className="hidden md:flex items-center gap-2">
      <ShareButton planId={planId} rtcProvider={rtcProvider} isOwner={isOwner} />

      {/* Import conversation button */}
      <Tooltip delay={0}>
        <ImportConversationButton planId={planId} ydoc={ydoc} rtcProvider={rtcProvider} />
        <Tooltip.Content>Import conversation from file</Tooltip.Content>
      </Tooltip>

      {/* Handoff conversation button - only shown if plan has origin transcript */}
      {hasOriginTranscript && (
        <Tooltip delay={0}>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Handoff conversation to another agent"
            onPress={onHandoffDialogOpen}
            className="touch-target"
          >
            <MessageSquareShare className="w-4 h-4" />
          </Button>
          <Tooltip.Content>Handoff conversation to another agent</Tooltip.Content>
        </Tooltip>
      )}

      {/* Link PR button */}
      <LinkPRButton ydoc={ydoc} isOpen={isLinkPROpen} onOpenChange={onLinkPROpenChange} />

      {/* Archive icon button */}
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={isArchived ? 'Unarchive plan' : 'Archive plan'}
        onPress={onArchiveToggle}
        className="touch-target"
      >
        {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
      </Button>
    </div>
  );
}

/** Props for mobile dropdown menu */
interface MobileDropdownMenuProps {
  hasOriginTranscript: boolean;
  isArchived: boolean;
  onAction: (key: React.Key) => void;
}

/** Mobile dropdown menu with all actions */
function _MobileDropdownMenu({
  hasOriginTranscript,
  isArchived,
  onAction,
}: MobileDropdownMenuProps) {
  return (
    <div className="flex md:hidden">
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
          <Dropdown.Menu onAction={onAction}>
            <Dropdown.Item id="share" textValue="Share">
              <Share2 className="w-4 h-4 shrink-0 text-muted" />
              <Label>Share</Label>
            </Dropdown.Item>

            <Dropdown.Item id="import" textValue="Import conversation">
              <Upload className="w-4 h-4 shrink-0 text-muted" />
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
function _ImportReviewModal({
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

/** Simple identity type for display purposes */
interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface PlanHeaderProps {
  ydoc: Y.Doc;
  /** Plan ID for archive actions */
  planId: string;
  /** Current metadata from parent component */
  metadata: PlanMetadata;
  /** User identity for review actions */
  identity: UserIdentity | null;
  /** Called when user needs to set up identity */
  onRequestIdentity: () => void;
  /** Called after status is successfully updated in the plan doc */
  onStatusChange?: (newStatus: 'approved' | 'changes_requested') => void;
  /** When true, shows snapshot indicator and hides interactive elements */
  isSnapshot?: boolean;
  /** WebRTC provider for P2P sync and awareness (needed for approval panel) */
  rtcProvider?: WebrtcProvider | null;
}

export function PlanHeader({
  ydoc,
  planId,
  metadata,
  identity,
  onRequestIdentity,
  onStatusChange,
  isSnapshot = false,
  rtcProvider = null,
}: PlanHeaderProps) {
  // No local state or observer - metadata comes from parent to avoid duplicate observers
  const display = metadata;
  const { syncState } = useActivePlanSync();
  const isMobile = useIsMobile();
  const isArchived = !!display.archivedAt;
  const { identity: githubIdentity } = useGitHubAuth();
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const ownerId = getPlanOwnerId(ydoc);

  // Handoff conversation dialog state
  const [isHandoffDialogOpen, setIsHandoffDialogOpen] = useState(false);

  // Link PR popover state - managed here for mobile dropdown
  const [isLinkPROpen, setIsLinkPROpen] = useState(false);

  // File input ref for mobile import
  const mobileImportInputRef = useRef<HTMLInputElement>(null);

  // Conversation transfer hook for mobile import
  const { importFromFile } = useConversationTransfer(planId, ydoc, rtcProvider);

  // State for mobile import review modal
  const [mobileImportData, setMobileImportData] = useState<{
    messages: import('@peer-plan/schema').A2AMessage[];
    meta: import('@peer-plan/schema').ConversationExportMeta;
    summary: { title: string; text: string };
  } | null>(null);
  const [isMobileReviewOpen, setIsMobileReviewOpen] = useState(false);

  // Check if this plan has an origin transcript (can be handed off)
  // Type-safe check: only Claude Code origin with transcript path can be handed off
  const hasOriginTranscript = Boolean(
    display.origin?.platform === 'claude-code' && display.origin.transcriptPath
  );

  // Read transcript content for handoff
  const transcriptContent = useMemo(() => {
    const content = getTranscriptContent(ydoc);
    return content || null;
  }, [ydoc]);

  const handleArchiveToggle = () => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const now = Date.now();

    // Update plan metadata
    ydoc.transact(() => {
      const metadataMap = ydoc.getMap('metadata');
      if (isArchived) {
        metadataMap.delete('archivedAt');
        metadataMap.delete('archivedBy');
      } else {
        metadataMap.set('archivedAt', now);
        metadataMap.set('archivedBy', githubIdentity.displayName);
      }
      metadataMap.set('updatedAt', now);
    });

    // Update plan index
    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      if (isArchived) {
        const { deletedAt: _removed1, deletedBy: _removed2, ...rest } = entry;
        setPlanIndexEntry(indexDoc, { ...rest, updatedAt: now });
        toast.success('Plan unarchived');
      } else {
        setPlanIndexEntry(indexDoc, {
          ...entry,
          deletedAt: now,
          deletedBy: githubIdentity.displayName,
          updatedAt: now,
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
        mobileImportInputRef.current?.click();
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
   * Handle mobile file import selection.
   */
  async function handleMobileFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = '';

    const result = await importFromFile(file);

    if (result.success && result.messages && result.meta && result.summary) {
      setMobileImportData({
        messages: result.messages,
        meta: result.meta,
        summary: result.summary,
      });
      setIsMobileReviewOpen(true);
    } else {
      toast.error(result.error ?? 'Import failed');
    }
  }

  /**
   * Confirm mobile import.
   */
  function handleMobileImportConfirm() {
    if (mobileImportData) {
      toast.success(`Imported ${mobileImportData.meta.messageCount} messages`);
    }
    setIsMobileReviewOpen(false);
    setMobileImportData(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {/* Title and status */}
      <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">{display.title}</h1>
      <StatusChip status={display.status} className="shrink-0" />
      {isSnapshot && (
        <Chip color="warning" variant="soft" className="shrink-0">
          snapshot
        </Chip>
      )}
      {(display.repo || display.pr) && (
        <span className="text-xs md:text-sm text-muted-foreground shrink-0">
          {display.repo}
          {display.pr && ` #${display.pr}`}
        </span>
      )}

      {/* Archived badge */}
      {isArchived && (
        <Chip color="default" variant="soft" className="shrink-0">
          archived
        </Chip>
      )}

      {/* Right side: agents/peers, review actions, share - hidden for snapshots */}
      {!isSnapshot && (
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Presence indicators */}
          {syncState && syncState.activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {syncState.activeCount} {syncState.activeCount === 1 ? 'agent' : 'agents'}
            </span>
          )}
          {syncState && syncState.peerCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              {syncState.peerCount} {syncState.peerCount === 1 ? 'peer' : 'peers'}
            </span>
          )}

          {/* Approval panel for plan owners - shows pending access requests */}
          <ApprovalPanel
            ydoc={ydoc}
            rtcProvider={rtcProvider}
            currentUsername={githubIdentity?.username ?? null}
            ownerId={ownerId}
          />

          {/* Review actions - inline on desktop, floating on mobile */}
          {!isMobile && (
            <>
              <ReviewActions
                ydoc={ydoc}
                currentStatus={display.status}
                identity={identity}
                onRequestIdentity={onRequestIdentity}
                onStatusChange={onStatusChange}
              />

              {/* Divider between review actions and utility icons */}
              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          {/* Desktop: Show all buttons individually (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-2">
            <ShareButton
              planId={planId}
              rtcProvider={rtcProvider}
              isOwner={!!(githubIdentity && ownerId && githubIdentity.username === ownerId)}
            />

            {/* Import conversation button */}
            <Tooltip delay={0}>
              <ImportConversationButton planId={planId} ydoc={ydoc} rtcProvider={rtcProvider} />
              <Tooltip.Content>Import conversation from file</Tooltip.Content>
            </Tooltip>

            {/* Handoff conversation button - only shown if plan has origin transcript */}
            {hasOriginTranscript && (
              <Tooltip delay={0}>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label="Handoff conversation to another agent"
                  onPress={() => setIsHandoffDialogOpen(true)}
                  className="touch-target"
                >
                  <MessageSquareShare className="w-4 h-4" />
                </Button>
                <Tooltip.Content>Handoff conversation to another agent</Tooltip.Content>
              </Tooltip>
            )}

            {/* Link PR button */}
            <LinkPRButton ydoc={ydoc} isOpen={isLinkPROpen} onOpenChange={setIsLinkPROpen} />

            {/* Archive icon button */}
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label={isArchived ? 'Unarchive plan' : 'Archive plan'}
              onPress={handleArchiveToggle}
              className="touch-target"
            >
              {isArchived ? (
                <ArchiveRestore className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Mobile: Show dropdown menu with all actions */}
          <div className="flex md:hidden">
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
                    <Upload className="w-4 h-4 shrink-0 text-muted" />
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
          </div>
        </div>
      )}

      {/* Handoff conversation dialog */}
      <HandoffConversationDialog
        planId={planId}
        ydoc={ydoc}
        rtcProvider={rtcProvider}
        isOpen={isHandoffDialogOpen}
        onClose={() => setIsHandoffDialogOpen(false)}
        transcriptContent={transcriptContent}
      />

      {/* Hidden file input for mobile import */}
      <input
        ref={mobileImportInputRef}
        type="file"
        accept=".json,.a2a.json"
        onChange={handleMobileFileSelect}
        className="hidden"
        aria-label="Import conversation file (mobile)"
      />

      {/* Mobile import review modal */}
      {mobileImportData && (
        <Modal.Backdrop
          isOpen={isMobileReviewOpen}
          onOpenChange={(open) => !open && setIsMobileReviewOpen(false)}
        >
          <Modal.Container size="md">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
                  <MessageSquare className="size-5" />
                </Modal.Icon>
                <Modal.Heading>Review Imported Conversation</Modal.Heading>
                <p className="text-sm leading-5 text-muted-foreground">
                  {mobileImportData.summary.title}
                </p>
              </Modal.Header>

              <Modal.Body className="p-4">
                {/* Metadata summary */}
                <Card variant="secondary" className="mb-4">
                  <Card.Content className="p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span>{' '}
                        <span className="text-foreground">
                          {mobileImportData.meta.sourcePlatform}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Messages:</span>{' '}
                        <span className="text-foreground">
                          {mobileImportData.meta.messageCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Exported:</span>{' '}
                        <span className="text-foreground">
                          {new Date(mobileImportData.meta.exportedAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Session:</span>{' '}
                        <span className="text-foreground font-mono text-xs">
                          {mobileImportData.meta.sourceSessionId.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </Card.Content>
                </Card>

                {/* Message preview */}
                <p className="text-sm text-muted-foreground mb-3">Conversation preview:</p>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {mobileImportData.messages.slice(0, 5).map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const firstTextPart = msg.parts.find((p) => p.type === 'text');
                    const text =
                      firstTextPart && 'text' in firstTextPart
                        ? firstTextPart.text
                        : '[Non-text content]';
                    const preview = text.length > 150 ? `${text.slice(0, 150)}...` : text;

                    return (
                      <div
                        key={msg.messageId || idx}
                        className={`flex gap-2 ${isUser ? '' : 'flex-row-reverse'}`}
                      >
                        <Avatar size="sm" color={isUser ? 'default' : 'accent'}>
                          <Avatar.Fallback>{isUser ? 'U' : 'A'}</Avatar.Fallback>
                        </Avatar>
                        <div
                          className={`flex-1 p-2 rounded-lg text-sm ${
                            isUser ? 'bg-surface-secondary' : 'bg-accent/10'
                          }`}
                        >
                          <p className="text-muted-foreground text-xs mb-1">
                            {isUser ? 'User' : 'Agent'}
                          </p>
                          <p className="text-foreground">{preview}</p>
                        </div>
                      </div>
                    );
                  })}
                  {mobileImportData.messages.length > 5 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      ... and {mobileImportData.messages.length - 5} more messages
                    </p>
                  )}
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setIsMobileReviewOpen(false);
                    setMobileImportData(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onPress={handleMobileImportConfirm}>
                  <Check className="w-4 h-4" />
                  Import Conversation
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      )}
    </div>
  );
}
