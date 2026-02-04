/**
 * TaskHeader - Main header bar for task pages.
 *
 * Layout matches the original design:
 * - Left side: Title, Status, AgentRequestsBadge, badges (snapshot, repo, archived)
 * - Left side (continued): Tags, TagEditor
 * - Right side (ml-auto): Presence, ApprovalPanel, ReviewActions, Separator, DesktopActions
 */

import { Button, Chip, Popover, Separator, Tooltip } from '@heroui/react';
import { isTaskStatus, type TaskId } from '@shipyard/loro-schema';
import { Archive, ArchiveRestore, Tag } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AgentRequestsBadge } from '@/components/agent-requests-badge';
import { ApprovalPanel } from '@/components/approval-panel';
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
import { TagChip } from '@/components/tag-chip';
import { TagEditor } from '@/components/tag-editor';
import { TruncatedText } from '@/components/ui/truncated-text';
import { type ConnectedPeer as HookConnectedPeer, useP2PPeers } from '@/hooks/use-p2p-peers';
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface HeaderBadgesProps {
  isSnapshot: boolean;
  isArchived: boolean;
  repo?: string;
  pr?: number;
}

function HeaderBadges({ isSnapshot, isArchived, repo, pr }: HeaderBadgesProps) {
  return (
    <>
      {isSnapshot && (
        <Chip color="warning" variant="soft" className="shrink-0">
          snapshot
        </Chip>
      )}
      {(repo || pr) && (
        <span className="shrink-0 text-xs text-muted-foreground md:text-sm">
          {repo}
          {pr && ` #${pr}`}
        </span>
      )}
      {isArchived && (
        <Chip color="default" variant="soft" className="shrink-0">
          archived
        </Chip>
      )}
    </>
  );
}

interface TagsDisplayProps {
  tags: string[];
}

function TagsDisplay({ tags }: TagsDisplayProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
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
          <Button isIconOnly variant="ghost" size="sm" aria-label="Edit tags" className="touch-target">
            <Tag className="h-4 w-4" />
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

          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

interface DesktopActionsProps {
  taskId: TaskId;
  isArchived: boolean;
  onArchiveToggle: () => void;
}

function DesktopActions({ taskId, isArchived, onArchiveToggle }: DesktopActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <ShareButton taskId={taskId} />

      <CopySnapshotUrlButton taskId={taskId} />

      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <LinkPRButton taskId={taskId} />
        </Tooltip.Trigger>
        <Tooltip.Content>Link a GitHub pull request</Tooltip.Content>
      </Tooltip>

      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={isArchived ? 'Unarchive task' : 'Archive task'}
            onPress={onArchiveToggle}
            className="touch-target"
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{isArchived ? 'Unarchive task' : 'Archive task'}</Tooltip.Content>
      </Tooltip>

      <NotificationsButton taskId={taskId} />
    </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function TaskHeader({ taskId, isSnapshot = false, isMobile = false }: TaskHeaderProps) {
  const meta = useTaskMeta(taskId);
  const taskDoc = useTaskDocument(taskId);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [isLinkPROpen, setIsLinkPROpen] = useState(false);
  const { connectedPeers } = useP2PPeers();
  const copySnapshotUrl = useCopySnapshotUrl(taskId);

  const isArchived = Boolean(meta.archivedAt);
  const mappedPeers = useMemo(() => connectedPeers.map(mapPeerForPresence), [connectedPeers]);

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

  const showReviewActions = !isSnapshot && meta.status === 'pending_review' && isTaskStatus(meta.status);
  const statusToDisplay = isTaskStatus(meta.status) ? meta.status : 'draft';

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {/* ─── Left side: Title, Status, AgentRequestsBadge ─── */}
      <TruncatedText
        text={meta.title}
        maxLength={30}
        className="truncate text-lg font-semibold text-foreground md:text-xl"
        as="h1"
      />
      <StatusChip status={statusToDisplay} className="shrink-0" />

      {/* AgentRequestsBadge - prominent position after status (old layout) */}
      {!isSnapshot && <AgentRequestsBadge taskId={taskId} isSnapshot={isSnapshot} />}

      {/* ─── Badges: snapshot, repo/PR, archived ─── */}
      <HeaderBadges
        isSnapshot={isSnapshot}
        isArchived={isArchived}
        repo={meta.repo ?? undefined}
        pr={undefined}
      />

      {/* ─── Tags + Editor ─── */}
      {!isSnapshot && <TagsDisplay tags={meta.tags} />}
      {!isSnapshot && (
        <TagEditorPopover
          isOpen={isTagEditorOpen}
          onOpenChange={setIsTagEditorOpen}
          tags={meta.tags}
          onTagsChange={handleTagsChange}
        />
      )}

      {/* ─── Right side: Presence, ApprovalPanel, ReviewActions, Actions ─── */}
      {!isSnapshot && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Presence indicators */}
          <PresenceIndicators connectedPeers={mappedPeers} />

          {/* Approval panel for task owners (pending access requests) */}
          <ApprovalPanel taskId={taskId} />

          {/* Review actions (desktop inline, mobile floating) */}
          {!isMobile && showReviewActions && (
            <>
              <ReviewActions taskId={taskId} currentStatus={meta.status} />
              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          {/* Desktop actions */}
          {!isMobile && (
            <DesktopActions taskId={taskId} isArchived={isArchived} onArchiveToggle={handleArchiveToggle} />
          )}

          {/* Mobile actions */}
          {isMobile && (
            <MobileActions
              taskId={taskId}
              isArchived={isArchived}
              isLinkPROpen={isLinkPROpen}
              onLinkPROpenChange={setIsLinkPROpen}
              onAction={handleMobileDropdownAction}
            />
          )}
        </div>
      )}
    </div>
  );
}
