import { Button, Chip, Popover, Separator, Tooltip } from '@heroui/react';
import { isTaskStatus, type TaskId } from '@shipyard/loro-schema';
import { Archive, ArchiveRestore, Tag } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AgentRequestsBadge } from '@/components/agent-requests-badge';
import { AgentStatusIndicator } from '@/components/agent-status-indicator';
import { CopySnapshotUrlButton, useCopySnapshotUrl } from '@/components/copy-snapshot-url-button';
import { LinkPRButton } from '@/components/link-pr-button';
import { type MobileDropdownAction, MobileDropdownMenu } from '@/components/mobile-dropdown-menu';
import { NotificationsButton } from '@/components/notifications-button';
import {
  type ConnectedPeer as PresenceConnectedPeer,
  PresenceIndicators,
} from '@/components/presence-indicators';
import { ReviewActions } from '@/components/review-actions';
import { ShareButton } from '@/components/share-button';
import { StatusChip } from '@/components/status-chip';
import { SyncStatus } from '@/components/sync-status';
import { TagChip } from '@/components/tag-chip';
import { TagEditor } from '@/components/tag-editor';
import { TruncatedText } from '@/components/ui/truncated-text';
import { type ConnectedPeer as HookConnectedPeer, useP2PPeers } from '@/hooks/use-p2p-peers';
import { useServerConnection } from '@/hooks/use-server-connection';
import { useTaskMeta } from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';

/**
 * Maps ConnectedPeer from the hook (loro-schema types with null)
 * to the PresenceIndicators component format (optional with undefined)
 */
function mapPeerForPresence(peer: HookConnectedPeer): PresenceConnectedPeer {
  return {
    webrtcPeerId: peer.webrtcPeerId,
    platform: peer.platform,
    name: peer.name,
    color: peer.color,
    isOwner: peer.isOwner,
    connectedAt: peer.connectedAt,
    hasDaemon: peer.hasDaemon,
    context: peer.context
      ? {
          branch: peer.context.branch ?? undefined,
          projectName: peer.context.project ?? undefined,
          hostname: peer.context.hostname ?? undefined,
        }
      : undefined,
    browserContext: peer.browserContext
      ? {
          browser: peer.browserContext.browser ?? undefined,
          os: peer.browserContext.os ?? undefined,
          lastActive: peer.browserContext.lastActive ?? undefined,
        }
      : undefined,
  };
}

interface TaskHeaderProps {
  taskId: TaskId;
  isSnapshot?: boolean;
  isMobile?: boolean;
}

interface DesktopActionsProps {
  taskId: TaskId;
  isArchived: boolean;
  onArchiveToggle: () => void;
}

function DesktopActions({ taskId, isArchived, onArchiveToggle }: DesktopActionsProps) {
  return (
    <>
      <Separator orientation="vertical" className="h-6" />

      <ShareButton taskId={taskId} />

      <CopySnapshotUrlButton taskId={taskId} />

      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <LinkPRButton taskId={taskId} />
        </Tooltip.Trigger>
        <Tooltip.Content>Link a GitHub pull request</Tooltip.Content>
      </Tooltip>

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

interface MobileActionsProps {
  taskId: TaskId;
  isArchived: boolean;
  isLinkPROpen: boolean;
  onLinkPROpenChange: (open: boolean) => void;
  onAction: (action: MobileDropdownAction) => void;
}

function MobileActions({
  taskId,
  isArchived,
  isLinkPROpen,
  onLinkPROpenChange,
  onAction,
}: MobileActionsProps) {
  return (
    <>
      <MobileDropdownMenu taskId={taskId} isArchived={isArchived} onAction={onAction} />

      <LinkPRButton
        taskId={taskId}
        isOpen={isLinkPROpen}
        onOpenChange={onLinkPROpenChange}
        className="hidden"
      />
    </>
  );
}

interface HeaderBadgesProps {
  isSnapshot: boolean;
  isArchived: boolean;
  repo?: string;
}

function HeaderBadges({ isSnapshot, isArchived, repo }: HeaderBadgesProps) {
  return (
    <>
      {isSnapshot && (
        <Chip color="warning" variant="soft" className="shrink-0">
          snapshot
        </Chip>
      )}
      {repo && <span className="text-xs md:text-sm text-muted-foreground shrink-0">{repo}</span>}
      {isArchived && (
        <Chip color="default" variant="soft" className="shrink-0">
          archived
        </Chip>
      )}
    </>
  );
}

interface HeaderActionBarProps {
  taskId: TaskId;
  isSnapshot: boolean;
  isMobile: boolean;
  syncState: 'offline' | 'synced';
  serverConnected: boolean;
  peerCount: number;
  mappedPeers: PresenceConnectedPeer[];
  isArchived: boolean;
  isLinkPROpen: boolean;
  onArchiveToggle: () => void;
  onLinkPROpenChange: (open: boolean) => void;
  onMobileAction: (action: MobileDropdownAction) => void;
}

function HeaderActionBar({
  taskId,
  isSnapshot,
  isMobile,
  syncState,
  serverConnected,
  peerCount,
  mappedPeers,
  isArchived,
  isLinkPROpen,
  onArchiveToggle,
  onLinkPROpenChange,
  onMobileAction,
}: HeaderActionBarProps) {
  return (
    <div className="flex items-center gap-2 ml-auto shrink-0">
      {!isMobile && (
        <SyncStatus syncState={syncState} serverConnected={serverConnected} peerCount={peerCount} />
      )}
      {syncState !== 'offline' && <PresenceIndicators connectedPeers={mappedPeers} />}
      <AgentRequestsBadge taskId={taskId} isSnapshot={isSnapshot} />
      <NotificationsButton taskId={taskId} />

      {!isMobile && (
        <DesktopActions taskId={taskId} isArchived={isArchived} onArchiveToggle={onArchiveToggle} />
      )}
      {isMobile && (
        <MobileActions
          taskId={taskId}
          isArchived={isArchived}
          isLinkPROpen={isLinkPROpen}
          onLinkPROpenChange={onLinkPROpenChange}
          onAction={onMobileAction}
        />
      )}
    </div>
  );
}

interface TagsDisplayProps {
  tags: string[];
}

function TagsDisplay({ tags }: TagsDisplayProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex gap-1 items-center">
      {tags.slice(0, 3).map((tag) => (
        <TagChip key={tag} tag={tag} size="sm" />
      ))}
      {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
    </div>
  );
}

interface TagEditorPopoverProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  onTagsChange: (newTags: string[]) => void;
}

function TagEditorPopover({ isOpen, onOpenChange, tags, onTagsChange }: TagEditorPopoverProps) {
  return (
    <Popover isOpen={isOpen} onOpenChange={onOpenChange}>
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Edit tags"
            className="touch-target"
          >
            <Tag className="w-4 h-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Edit tags</Tooltip.Content>
      </Tooltip>

      <Popover.Content placement="bottom" className="w-96">
        <Popover.Dialog>
          <Popover.Arrow />
          <Popover.Heading>Edit Tags</Popover.Heading>

          <div className="mt-3">
            <TagEditor tags={[...tags]} onTagsChange={onTagsChange} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="ghost" onPress={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function deriveSyncState(serverConnected: boolean, peerCount: number): 'offline' | 'synced' {
  if (!serverConnected && peerCount === 0) {
    return 'offline';
  }
  return 'synced';
}

async function copyToClipboardWithFallback(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

function buildTaskUrl(taskId: TaskId): string {
  const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/task/${taskId}`;
}

export function TaskHeader({ taskId, isSnapshot = false, isMobile = false }: TaskHeaderProps) {
  const meta = useTaskMeta(taskId);
  const taskDoc = useTaskDocument(taskId);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [isLinkPROpen, setIsLinkPROpen] = useState(false);
  const { connectedPeers, peerCount } = useP2PPeers();
  const serverConnected = useServerConnection();
  const copySnapshotUrl = useCopySnapshotUrl(taskId);

  const isArchived = Boolean(meta.archivedAt);
  const mappedPeers = useMemo(() => connectedPeers.map(mapPeerForPresence), [connectedPeers]);
  const syncState = useMemo(
    () => deriveSyncState(serverConnected, peerCount),
    [serverConnected, peerCount]
  );

  const handleArchiveToggle = useCallback(() => {
    const actor = meta.ownerId || 'unknown';

    if (isArchived) {
      taskDoc.meta.archivedAt = null;
      taskDoc.meta.archivedBy = null;
      taskDoc.logEvent('task_unarchived', actor, {});
    } else {
      taskDoc.meta.archivedAt = Date.now();
      taskDoc.meta.archivedBy = actor;
      taskDoc.logEvent('task_archived', actor, {});
    }
  }, [isArchived, meta.ownerId, taskDoc]);

  const handleTagsChange = useCallback(
    (newTags: string[]) => {
      const existingTags = taskDoc.meta.tags;
      existingTags.delete(0, existingTags.length);
      for (const tag of newTags) {
        existingTags.push(tag);
      }
      setIsTagEditorOpen(false);
    },
    [taskDoc.meta.tags]
  );

  const handleMobileDropdownAction = useCallback(
    (action: MobileDropdownAction) => {
      const actionHandlers: Record<MobileDropdownAction, () => void> = {
        share: () => {
          copyToClipboardWithFallback(buildTaskUrl(taskId));
          toast.success('Link copied!', {
            description: 'Share this link to collaborate on the task.',
          });
        },
        'copy-snapshot-url': copySnapshotUrl,
        'link-pr': () => setIsLinkPROpen(true),
        archive: handleArchiveToggle,
        unarchive: handleArchiveToggle,
      };
      actionHandlers[action]?.();
    },
    [taskId, copySnapshotUrl, handleArchiveToggle]
  );

  const showReviewActions =
    !isSnapshot && meta.status === 'pending_review' && isTaskStatus(meta.status);
  const statusToDisplay = isTaskStatus(meta.status) ? meta.status : 'draft';

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <TruncatedText
        text={meta.title}
        maxLength={30}
        className="text-lg md:text-xl font-semibold text-foreground truncate"
        as="h1"
      />
      <StatusChip status={statusToDisplay} className="shrink-0" />

      <HeaderBadges isSnapshot={isSnapshot} isArchived={isArchived} repo={meta.repo ?? undefined} />

      {!isSnapshot && (
        <AgentStatusIndicator taskId={taskId} variant={isMobile ? 'compact' : 'full'} />
      )}
      {showReviewActions && <ReviewActions taskId={taskId} currentStatus={meta.status} />}
      {!isSnapshot && <TagsDisplay tags={meta.tags} />}
      {!isSnapshot && (
        <TagEditorPopover
          isOpen={isTagEditorOpen}
          onOpenChange={setIsTagEditorOpen}
          tags={meta.tags}
          onTagsChange={handleTagsChange}
        />
      )}

      {!isSnapshot && (
        <HeaderActionBar
          taskId={taskId}
          isSnapshot={isSnapshot}
          isMobile={isMobile}
          syncState={syncState}
          serverConnected={serverConnected}
          peerCount={peerCount}
          mappedPeers={mappedPeers}
          isArchived={isArchived}
          isLinkPROpen={isLinkPROpen}
          onArchiveToggle={handleArchiveToggle}
          onLinkPROpenChange={setIsLinkPROpen}
          onMobileAction={handleMobileDropdownAction}
        />
      )}
    </div>
  );
}
