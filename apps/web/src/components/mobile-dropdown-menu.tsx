/**
 * Mobile dropdown menu for task actions.
 *
 * Provides mobile users with access to all header actions in a single dropdown menu,
 * conserving header space while maintaining full functionality.
 *
 * Actions include:
 * - Share: Copy task link
 * - Copy snapshot URL: Copy current state URL
 * - Resume conversation: Import a handed-off conversation
 * - Handoff conversation: Hand off to another agent (conditional)
 * - Link PR: Associate a GitHub PR
 * - Archive/Unarchive: Toggle archived state
 */

import { Button, Dropdown, Label } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import {
  Archive,
  ArchiveRestore,
  GitPullRequest,
  Link2,
  MessageSquareReply,
  MessageSquareShare,
  MoreVertical,
  Share2,
} from 'lucide-react';
import type React from 'react';

/** Action keys for the mobile dropdown menu */
const MOBILE_DROPDOWN_ACTIONS = [
  'share',
  'copy-snapshot-url',
  'import',
  'handoff',
  'link-pr',
  'archive',
  'unarchive',
] as const;

export type MobileDropdownAction = (typeof MOBILE_DROPDOWN_ACTIONS)[number];

/** Type guard to check if a value is a valid MobileDropdownAction */
function isMobileDropdownAction(value: unknown): value is MobileDropdownAction {
  return MOBILE_DROPDOWN_ACTIONS.includes(value as MobileDropdownAction);
}

interface MobileDropdownMenuProps {
  /** The task ID (used for context, not directly in component) */
  taskId: TaskId;
  /** Whether the task has an origin transcript that can be handed off */
  hasOriginTranscript: boolean;
  /** Whether the task is currently archived */
  isArchived: boolean;
  /** Callback when an action is selected */
  onAction: (key: MobileDropdownAction) => void;
  /** Optional className for the trigger button */
  className?: string;
}

/**
 * Mobile dropdown menu with all task header actions.
 *
 * Shows only on mobile via parent's CSS or isMobile prop.
 * Delegates all action handling to parent via onAction callback.
 */
export function MobileDropdownMenu({
  taskId: _taskId,
  hasOriginTranscript,
  isArchived,
  onAction,
  className,
}: MobileDropdownMenuProps) {
  const handleAction = (key: React.Key) => {
    if (!isMobileDropdownAction(key)) {
      // biome-ignore lint/suspicious/noConsole: Warn about unexpected action for debugging
      console.warn('Invalid mobile dropdown action:', key);
      return;
    }
    onAction(key);
  };

  return (
    <Dropdown>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="More actions"
        className={`touch-target ${className ?? ''}`}
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu onAction={handleAction}>
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
