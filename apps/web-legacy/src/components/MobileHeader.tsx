import { Button } from '@heroui/react';
import type { PlanStatusType } from '@shipyard/schema';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import type * as Y from 'yjs';
import { NotificationsButton } from '@/components/NotificationsButton';
import { StatusChip } from '@/components/StatusChip';
import { TruncatedText } from '@/components/ui/TruncatedText';

interface MobileHeaderProps {
  /** Called when the menu button is pressed */
  onMenuOpen: () => void;
  /** Plan title to display (optional for home page) */
  title?: string;
  /** Plan status badge (optional) */
  status?: PlanStatusType;
  /** Hub WebSocket connected indicator */
  hubConnected?: boolean;
  /** Peer count indicator */
  peerCount?: number;
  /** Share button action */
  onShare?: () => void;
  /** Index doc for input request notifications */
  indexDoc?: Y.Doc | null;
  /** Optional plan ID to filter notifications (only show requests for this specific plan) */
  planId?: string;
  /** Additional content to show (e.g., share button component) */
  rightContent?: ReactNode;
  /** Total inbox count to show badge on hamburger menu */
  inboxCount?: number;
  /** Whether inbox count is still loading (prevents flash from 0→actual) */
  isLoadingInbox?: boolean;
}

/**
 * Fixed header for mobile layout with hamburger menu button and plan metadata.
 * Height is 48px (h-12) to match pt-12 offset on main content.
 */
export function MobileHeader({
  onMenuOpen,
  title = 'Shipyard',
  status,
  hubConnected,
  peerCount,
  indexDoc,
  planId,
  rightContent,
  inboxCount = 0,
  isLoadingInbox = false,
}: MobileHeaderProps) {
  /** Hide badge during loading to prevent flash from 0→actual */
  const showBadge = !isLoadingInbox && inboxCount > 0;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-surface border-b border-separator flex items-center gap-1.5 px-1.5 pt-safe">
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={showBadge ? `Open menu, ${inboxCount} items need attention` : 'Open menu'}
        onPress={onMenuOpen}
        className="touch-target shrink-0 relative"
      >
        <Menu className="w-4 h-4" />
        {/* Inbox notification badge on hamburger menu */}
        {showBadge && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-warning text-warning-foreground text-[9px] flex items-center justify-center font-semibold animate-in fade-in zoom-in duration-200">
            {inboxCount > 9 ? '9+' : inboxCount}
          </span>
        )}
      </Button>

      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <TruncatedText
          text={title}
          maxLength={30}
          as="h1"
          className="text-xs font-semibold text-foreground truncate"
        />
      </div>

      {status && <StatusChip status={status} className="text-[11px] h-5 px-2 shrink-0" />}

      {hubConnected && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <span className="w-2 h-2 rounded-full bg-success" />
          hub
        </span>
      )}

      {peerCount !== undefined && peerCount > 0 && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <span className="w-2 h-2 rounded-full bg-info" />
          {peerCount}
        </span>
      )}

      {/* Notifications button for input requests */}
      {indexDoc && <NotificationsButton ydoc={indexDoc} planId={planId} />}

      {rightContent}
    </header>
  );
}
