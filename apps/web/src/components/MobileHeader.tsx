import { Button } from '@heroui/react';
import type { PlanStatusType } from '@peer-plan/schema';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusChip } from '@/components/StatusChip';

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
  /** Additional content to show (e.g., share button component) */
  rightContent?: ReactNode;
}

/**
 * Fixed header for mobile layout with hamburger menu button and plan metadata.
 * Height is 48px (h-12) to match pt-12 offset on main content.
 */
export function MobileHeader({
  onMenuOpen,
  title = 'Peer Plan',
  status,
  hubConnected,
  peerCount,
  rightContent,
}: MobileHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-surface border-b border-separator flex items-center gap-1.5 px-1.5 pt-safe">
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="Open menu"
        onPress={onMenuOpen}
        className="touch-target shrink-0"
      >
        <Menu className="w-4 h-4" />
      </Button>

      <h1 className="text-xs font-semibold text-foreground truncate flex-1 min-w-0">{title}</h1>

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

      {rightContent}
    </header>
  );
}
