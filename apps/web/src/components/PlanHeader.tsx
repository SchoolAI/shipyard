import type { BlockNoteEditor } from '@blocknote/core';
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
  PLAN_INDEX_DOC_NAME,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  GitPullRequest,
  MessageSquare,
  MessageSquareReply,
  MessageSquareShare,
  Monitor,
  MoreVertical,
  Share2,
} from 'lucide-react';
import { useRef, useState } from 'react';
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
import { type ConnectedPeer, useP2PPeers } from '@/hooks/useP2PPeers';

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

/** Props for the presence indicators */
interface PresenceIndicatorsProps {
  connectedPeers: ConnectedPeer[];
}

/**
 * Check if a platform represents an AI agent (not a browser).
 * Known agent platforms: claude-code, devin, cursor, aider, etc.
 */
function isAgentPlatform(platform: string): boolean {
  const agentPlatforms = ['claude-code', 'devin', 'cursor', 'aider', 'copilot', 'cody'];
  return agentPlatforms.includes(platform.toLowerCase());
}

/**
 * Format platform name for display (e.g., 'claude-code' -> 'Claude Code')
 */
function formatPlatformName(platform: string): string {
  const platformNames: Record<string, string> = {
    'claude-code': 'Claude Code',
    devin: 'Devin',
    cursor: 'Cursor',
    aider: 'Aider',
    copilot: 'GitHub Copilot',
    cody: 'Sourcegraph Cody',
    browser: 'Browser',
  };
  return platformNames[platform.toLowerCase()] ?? platform;
}

/** Renders hub connection and peer presence indicators */
function PresenceIndicators({ connectedPeers }: PresenceIndicatorsProps) {
  // Group peers by type (agent vs browser)
  const agents = connectedPeers.filter((p) => isAgentPlatform(p.platform));
  const browsers = connectedPeers.filter((p) => !isAgentPlatform(p.platform));

  const agentCount = agents.length;
  const browserCount = browsers.length;
  const totalPeers = connectedPeers.length;

  // Generate display text based on peer composition
  const getPeerDisplayText = () => {
    if (totalPeers === 0) return null;

    if (browserCount === 0 && agentCount > 0) {
      // Only agents
      return (
        <span className="flex items-center gap-1.5">
          <Bot className="w-3 h-3" />
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      );
    }

    if (agentCount === 0 && browserCount > 0) {
      // Only browsers
      return (
        <span className="flex items-center gap-1.5">
          <Monitor className="w-3 h-3" />
          {browserCount} {browserCount === 1 ? 'browser' : 'browsers'}
        </span>
      );
    }

    // Mixed: browsers and agents
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

  // Generate tooltip content with peer details
  const getTooltipContent = () => {
    if (totalPeers === 0) return null;

    return (
      <div className="flex flex-col gap-1.5 py-1">
        {agents.length > 0 && (
          <div className="flex flex-col gap-1">
            {agents.map((agent, idx) => (
              <div key={`agent-${idx}`} className="flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium">{formatPlatformName(agent.platform)}</span>
                {agent.name && agent.name !== `Peer ${idx}` && (
                  <span className="text-muted-foreground">({agent.name})</span>
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
}

/** Desktop action buttons (share, import, handoff, link PR, archive) */
function DesktopActions({
  planId,
  ydoc,
  rtcProvider,
  isOwner,
  hasOriginTranscript,
  isArchived,
  onHandoffDialogOpen,
  onArchiveToggle,
}: DesktopActionsProps) {
  return (
    <>
      <ShareButton planId={planId} rtcProvider={rtcProvider} isOwner={isOwner} />

      {/* Resume conversation button */}
      <Tooltip delay={0}>
        <ImportConversationButton planId={planId} ydoc={ydoc} rtcProvider={rtcProvider} />
        <Tooltip.Content>Resume a handed-off conversation</Tooltip.Content>
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
  /** Called after status is successfully updated in the plan doc, with the timestamp used */
  onStatusChange?: (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => void;
  /** When true, shows snapshot indicator and hides interactive elements */
  isSnapshot?: boolean;
  /** WebRTC provider for P2P sync and awareness (needed for approval panel) */
  rtcProvider?: WebrtcProvider | null;
  /** BlockNote editor instance for snapshots - Issue #42 */
  editor?: BlockNoteEditor | null;
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
  editor = null,
}: PlanHeaderProps) {
  // No local state or observer - metadata comes from parent to avoid duplicate observers
  const display = metadata;
  const { syncState } = useActivePlanSync();
  const isMobile = useIsMobile();
  const isArchived = !!display.archivedAt;
  const { identity: githubIdentity } = useGitHubAuth();
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const ownerId = getPlanOwnerId(ydoc);
  const { connectedPeers } = useP2PPeers(rtcProvider);

  // Handoff conversation dialog state
  const [isHandoffDialogOpen, setIsHandoffDialogOpen] = useState(false);

  // Link PR popover state - managed here for mobile dropdown
  const [isLinkPROpen, setIsLinkPROpen] = useState(false);

  // File input ref for mobile import
  const mobileImportInputRef = useRef<HTMLInputElement>(null);

  // Conversation transfer hook for mobile import
  const { importFromFile } = useConversationTransfer(planId, ydoc, rtcProvider);

  // State for mobile import review modal
  const [mobileImportData, setMobileImportData] = useState<MobileImportData | null>(null);
  const [isMobileReviewOpen, setIsMobileReviewOpen] = useState(false);

  // Check if this plan has an origin transcript (can be handed off)
  // Type-safe check: only Claude Code origin with transcript path can be handed off
  const hasOriginTranscript = Boolean(
    display.origin?.platform === 'claude-code' && display.origin.transcriptPath
  );

  const handleArchiveToggle = () => {
    if (!githubIdentity) {
      toast.error('Please sign in with GitHub first');
      return;
    }

    const now = Date.now();

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
          {syncState && <PresenceIndicators connectedPeers={connectedPeers} />}

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
            />
            <LinkPRButton ydoc={ydoc} isOpen={isLinkPROpen} onOpenChange={setIsLinkPROpen} />
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
          onCancel={() => {
            setIsMobileReviewOpen(false);
            setMobileImportData(null);
          }}
        />
      )}
    </div>
  );
}
