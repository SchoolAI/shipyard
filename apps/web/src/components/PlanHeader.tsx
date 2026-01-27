import type { BlockNoteEditor } from '@blocknote/core';
import {
  Button,
  Card,
  Chip,
  Dropdown,
  Label,
  Modal,
  Popover,
  Separator,
  Tooltip,
} from '@heroui/react';
import type { A2AMessage, PlanIndexEntry, PlanMetadata } from '@shipyard/schema';
import {
  createPlanUrlWithHistory,
  getArtifacts,
  getDeliverables,
  getPlanOwnerId,
  getPlatformDisplayName,
  getSnapshots,
  isAgentPlatform,
} from '@shipyard/schema';
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  GitPullRequest,
  Link2,
  Loader2,
  MessageSquare,
  MessageSquareReply,
  MessageSquareShare,
  Monitor,
  MoreVertical,
  Share2,
  Tag,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { AgentRequestsBadge } from '@/components/AgentRequestsBadge';
import { ApprovalPanel } from '@/components/ApprovalPanel';
import { HandoffConversationDialog } from '@/components/HandoffConversationDialog';
import { ImportConversationButton } from '@/components/ImportConversationHandler';
import { LinkPRButton } from '@/components/LinkPRButton';
import { NotificationsButton } from '@/components/NotificationsButton';
import { ReviewActions } from '@/components/ReviewActions';
import { ShareButton } from '@/components/ShareButton';
import { StatusChip } from '@/components/StatusChip';
import { TagChip } from '@/components/TagChip';
import { TagEditor } from '@/components/TagEditor';
import { Avatar } from '@/components/ui/avatar';
import { TruncatedText } from '@/components/ui/TruncatedText';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { type MobileImportData, useHeaderActions } from '@/hooks/useHeaderActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { type ConnectedPeer, useP2PPeers } from '@/hooks/useP2PPeers';

/*
 * =====================================================================
 * Helper Functions & Sub-Components
 * =====================================================================
 */

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
  connectedPeers: ConnectedPeer[];
}

/** Renders hub connection and peer presence indicators */
function PresenceIndicators({ connectedPeers }: PresenceIndicatorsProps) {
  const agents = connectedPeers.filter((p) => isAgentPlatform(p.platform));
  const browsers = connectedPeers.filter((p) => !isAgentPlatform(p.platform));

  const agentCount = agents.length;
  const browserCount = browsers.length;
  const totalPeers = connectedPeers.length;

  const getPeerDisplayText = () => {
    if (totalPeers === 0) return null;

    if (browserCount === 0 && agentCount > 0) {
      return (
        <span className="flex items-center gap-1.5">
          <Bot className="w-3 h-3" />
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      );
    }

    if (agentCount === 0 && browserCount > 0) {
      return (
        <span className="flex items-center gap-1.5">
          <Monitor className="w-3 h-3" />
          {browserCount} {browserCount === 1 ? 'browser' : 'browsers'}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5">
        <Monitor className="w-3 h-3" />
        {browserCount}
        <span className="text-muted-foreground/50 mx-0.5">+</span>
        <Bot className="w-3 h-3" />
        {agentCount}
      </span>
    );
  };

  const getTooltipContent = () => {
    if (totalPeers === 0) return null;

    return (
      <div className="flex flex-col gap-1.5 py-1">
        {agents.length > 0 && (
          <div className="flex flex-col gap-1">
            {agents.map((agent, idx) => (
              <div key={`agent-${idx}`} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-accent" />
                  <span className="font-medium">{getPlatformDisplayName(agent.platform)}</span>
                  {agent.name && agent.name !== `Peer ${idx}` && (
                    <span className="text-muted-foreground">({agent.name})</span>
                  )}
                </div>

                {agent.context && (
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground ml-5">
                    {agent.context.projectName && <span> {agent.context.projectName}</span>}
                    {agent.context.branch && <span> {agent.context.branch}</span>}
                    {agent.context.hostname && <span> {agent.context.hostname}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {browsers.length > 0 && (
          <div className="flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5 text-info" />
            <span>
              {browserCount} {browserCount === 1 ? 'browser' : 'browsers'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const peerDisplay = getPeerDisplayText();
  const tooltipContent = getTooltipContent();

  return (
    <>
      {peerDisplay && (
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              {peerDisplay}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content className="text-xs">{tooltipContent}</Tooltip.Content>
        </Tooltip>
      )}
    </>
  );
}

/**
 * Get the OG Proxy Worker base URL.
 * Uses env var for local dev, defaults to production worker.
 */
function getOgProxyBaseUrl(): string {
  return import.meta.env.VITE_OG_PROXY_URL || 'https://shipyard-og-proxy.jacob-191.workers.dev';
}

/** Props for copy snapshot URL button */
interface CopySnapshotUrlButtonProps {
  ydoc: Y.Doc;
  metadata: PlanMetadata;
  editor: BlockNoteEditor | null;
}

/**
 * Button to generate and copy a shareable snapshot URL.
 * The URL includes all plan data encoded in the query string and
 * uses the OG proxy worker for proper Open Graph metadata.
 */
function CopySnapshotUrlButton({ ydoc, metadata, editor }: CopySnapshotUrlButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /** Fallback for older browsers */
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }, []);

  const handleCopySnapshotUrl = useCallback(async () => {
    if (!editor) {
      toast.error('Editor not ready');
      return;
    }

    setIsGenerating(true);

    try {
      /** Get current content blocks from the editor */
      const content = editor.document;

      /** Get artifacts, deliverables, and snapshots from Y.Doc */
      const artifacts = getArtifacts(ydoc);
      const deliverables = getDeliverables(ydoc);
      const snapshots = getSnapshots(ydoc);

      /** Generate the snapshot URL using OG proxy worker as base */
      const baseUrl = getOgProxyBaseUrl();
      const snapshotUrl = createPlanUrlWithHistory(
        baseUrl,
        {
          id: metadata.id,
          title: metadata.title,
          status: metadata.status,
          repo: metadata.repo,
          pr: metadata.pr,
          content,
          artifacts,
          deliverables,
        },
        snapshots
      );

      /** Copy to clipboard */
      await copyToClipboard(snapshotUrl);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      toast.success('Snapshot URL copied to clipboard');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to generate snapshot URL: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  }, [editor, ydoc, metadata, copyToClipboard]);

  const button = (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      onPress={handleCopySnapshotUrl}
      isDisabled={!editor}
      className="touch-target"
      aria-label="Copy snapshot URL"
    >
      {copied ? (
        <Check className="w-4 h-4 text-success" />
      ) : isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Link2 className="w-4 h-4" />
      )}
    </Button>
  );

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>{button}</Tooltip.Trigger>
      <Tooltip.Content>Copy snapshot URL for sharing</Tooltip.Content>
    </Tooltip>
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
  onHandoffDialogOpen: () => void;
  onArchiveToggle: () => void;
  metadata: PlanMetadata;
  editor: BlockNoteEditor | null;
}

/** Desktop action buttons (share, import, handoff, link PR, archive, copy snapshot URL) */
function DesktopActions({
  planId,
  ydoc,
  rtcProvider,
  isOwner,
  hasOriginTranscript,
  isArchived,
  onHandoffDialogOpen,
  onArchiveToggle,
  metadata,
  editor,
}: DesktopActionsProps) {
  return (
    <>
      <ShareButton planId={planId} rtcProvider={rtcProvider} isOwner={isOwner} ydoc={ydoc} />
      <CopySnapshotUrlButton ydoc={ydoc} metadata={metadata} editor={editor} />

      <Tooltip delay={0}>
        <ImportConversationButton planId={planId} ydoc={ydoc} rtcProvider={rtcProvider} />
        <Tooltip.Content>Resume a handed-off conversation</Tooltip.Content>
      </Tooltip>

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

      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={isArchived ? 'Unarchive task' : 'Archive task'}
        onPress={onArchiveToggle}
        className="touch-target"
      >
        {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
      </Button>
    </>
  );
}

/** Props for mobile dropdown menu */
interface MobileDropdownMenuProps {
  hasOriginTranscript: boolean;
  isArchived: boolean;
  onAction: (key: React.Key) => void;
}

/** Mobile dropdown menu with all actions */
function MobileDropdownMenu({
  hasOriginTranscript,
  isArchived,
  onAction,
}: MobileDropdownMenuProps) {
  return (
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

          <Dropdown.Item id="copy-snapshot-url" textValue="Copy snapshot URL">
            <Link2 className="w-4 h-4 shrink-0 text-muted" />
            <Label>Copy snapshot URL</Label>
          </Dropdown.Item>

          <Dropdown.Item id="import" textValue="Resume conversation">
            <MessageSquareReply className="w-4 h-4 shrink-0 text-muted" />
            <Label>Resume conversation</Label>
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
  );
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

/*
 * =====================================================================
 * Main Component
 * =====================================================================
 */

/** Simple identity type for display purposes */
interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface PlanHeaderProps {
  ydoc: Y.Doc;
  indexDoc: Y.Doc | null;
  planId: string;
  metadata: PlanMetadata;
  identity: UserIdentity | null;
  onRequestIdentity: () => void;
  onStatusChange?: (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => void;
  isSnapshot?: boolean;
  rtcProvider?: WebrtcProvider | null;
  editor?: BlockNoteEditor | null;
  onTagsChange?: (tags: string[]) => void;
  allPlans?: PlanIndexEntry[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: PlanHeader orchestrates many UI elements - complexity is inherent to the component's role as the main header
export function PlanHeader({
  ydoc,
  indexDoc,
  planId,
  metadata,
  identity,
  onRequestIdentity,
  onStatusChange,
  isSnapshot = false,
  rtcProvider = null,
  editor = null,
  onTagsChange,
  allPlans = [],
}: PlanHeaderProps) {
  const display = metadata;
  const { syncState } = useActivePlanSync();
  const isMobile = useIsMobile();
  const isArchived = !!display.archivedAt;
  const { identity: githubIdentity } = useGitHubAuth();
  const ownerId = getPlanOwnerId(ydoc);
  const { connectedPeers } = useP2PPeers(rtcProvider);

  /** Handler for copying snapshot URL (used by mobile dropdown) */
  const handleCopySnapshotUrl = useCallback(async () => {
    if (!editor) {
      toast.error('Editor not ready');
      return;
    }

    try {
      /** Get current content blocks from the editor */
      const content = editor.document;

      /** Get artifacts, deliverables, and snapshots from Y.Doc */
      const artifacts = getArtifacts(ydoc);
      const deliverables = getDeliverables(ydoc);
      const snapshots = getSnapshots(ydoc);

      /** Generate the snapshot URL using OG proxy worker as base */
      const baseUrl = getOgProxyBaseUrl();
      const snapshotUrl = createPlanUrlWithHistory(
        baseUrl,
        {
          id: metadata.id,
          title: metadata.title,
          status: metadata.status,
          repo: metadata.repo,
          pr: metadata.pr,
          content,
          artifacts,
          deliverables,
        },
        snapshots
      );

      /** Copy to clipboard */
      try {
        await navigator.clipboard.writeText(snapshotUrl);
      } catch {
        /** Fallback for older browsers */
        const textArea = document.createElement('textarea');
        textArea.value = snapshotUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      toast.success('Snapshot URL copied to clipboard');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to generate snapshot URL: ${errorMessage}`);
    }
  }, [editor, ydoc, metadata]);

  /** Use extracted hook for header actions */
  const headerActions = useHeaderActions(ydoc, indexDoc, planId, isArchived, rtcProvider, {
    onCopySnapshotUrl: handleCopySnapshotUrl,
  });
  const {
    isHandoffDialogOpen,
    setIsHandoffDialogOpen,
    isLinkPROpen,
    setIsLinkPROpen,
    isTagEditorOpen,
    setIsTagEditorOpen,
    mobileImportInputRef,
    mobileImportData,
    isMobileReviewOpen,
    setIsMobileReviewOpen,
    handleArchiveToggle,
    handleMobileFileSelect,
    handleMobileImportConfirm,
    handleMobileImportCancel,
    handleDropdownAction,
  } = headerActions;

  /** Check if this plan has an origin transcript (can be handed off) */
  const hasOriginTranscript = Boolean(
    display.origin?.platform === 'claude-code' && display.origin.transcriptPath
  );

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {/* Title and status */}
      <TruncatedText
        text={display.title}
        maxLength={50}
        className="text-lg md:text-xl font-semibold text-foreground truncate"
        as="h1"
      />
      <StatusChip status={display.status} className="shrink-0" />
      <AgentRequestsBadge ydoc={ydoc} isSnapshot={isSnapshot} />
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

      {/* Tags with inline editor - only show for live plans */}
      {!isSnapshot && display.tags && display.tags.length > 0 && (
        <div className="flex gap-1 items-center">
          {display.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag} tag={tag} size="sm" />
          ))}
          {display.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{display.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Tag editor button - only show for live plans */}
      {!isSnapshot && onTagsChange && (
        <Popover isOpen={isTagEditorOpen} onOpenChange={setIsTagEditorOpen}>
          <Tooltip delay={0}>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Edit tags"
              className="touch-target"
            >
              <Tag className="w-4 h-4" />
            </Button>
            <Tooltip.Content>Edit tags</Tooltip.Content>
          </Tooltip>

          <Popover.Content placement="bottom" className="w-96">
            <Popover.Dialog>
              <Popover.Arrow />
              <Popover.Heading>Edit Tags</Popover.Heading>

              <div className="mt-3">
                <TagEditor
                  tags={display.tags || []}
                  onTagsChange={(newTags) => {
                    onTagsChange(newTags);
                    setIsTagEditorOpen(false);
                  }}
                  allPlans={allPlans}
                />
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button size="sm" variant="ghost" onPress={() => setIsTagEditorOpen(false)}>
                  Done
                </Button>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      )}

      {/* Right side: agents/peers, review actions, share - hidden for snapshots */}
      {!isSnapshot && (
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Presence indicators */}
          {syncState && <PresenceIndicators connectedPeers={connectedPeers} />}

          {/* Approval panel for plan owners - shows pending access requests */}
          <ApprovalPanel
            ydoc={ydoc}
            rtcProvider={rtcProvider}
            currentUsername={githubIdentity?.username ?? null}
            ownerId={ownerId}
            planId={planId}
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
                editor={editor}
              />

              {/* Divider between review actions and utility icons */}
              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          {/* Desktop: Show all buttons individually */}
          <div className="hidden md:flex items-center gap-2">
            <DesktopActions
              planId={planId}
              ydoc={ydoc}
              rtcProvider={rtcProvider}
              isOwner={!!(githubIdentity && ownerId && githubIdentity.username === ownerId)}
              hasOriginTranscript={hasOriginTranscript}
              isArchived={isArchived}
              onHandoffDialogOpen={() => setIsHandoffDialogOpen(true)}
              onArchiveToggle={handleArchiveToggle}
              metadata={metadata}
              editor={editor}
            />
            <LinkPRButton ydoc={ydoc} isOpen={isLinkPROpen} onOpenChange={setIsLinkPROpen} />

            {/* Input request notifications */}
            <NotificationsButton ydoc={indexDoc} planId={planId} />
          </div>

          {/* Mobile: Show dropdown menu with all actions */}
          <div className="flex md:hidden">
            <MobileDropdownMenu
              hasOriginTranscript={hasOriginTranscript}
              isArchived={isArchived}
              onAction={handleDropdownAction}
            />
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
        hasOriginTranscript={hasOriginTranscript}
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
        <ImportReviewModal
          importData={mobileImportData}
          isOpen={isMobileReviewOpen}
          onOpenChange={(open) => !open && setIsMobileReviewOpen(false)}
          onConfirm={handleMobileImportConfirm}
          onCancel={handleMobileImportCancel}
        />
      )}
    </div>
  );
}
