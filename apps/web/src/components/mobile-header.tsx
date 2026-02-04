import { Button } from '@heroui/react';
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { TruncatedText } from '@/components/ui/truncated-text';

interface MobileHeaderProps {
  onMenuOpen: () => void;
  title?: string;
  inboxCount?: number;
  isLoadingInbox?: boolean;
  rightContent?: ReactNode;
}

export function MobileHeader({
  onMenuOpen,
  title = 'Shipyard',
  inboxCount = 0,
  isLoadingInbox = false,
  rightContent,
}: MobileHeaderProps) {
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

      {rightContent}
    </header>
  );
}
