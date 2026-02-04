import { Button } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  side: 'left' | 'right';
  isOpen: boolean;
  onToggle: () => void;
  width?: string;
  children: ReactNode;
  className?: string;
  collapsedContent?: ReactNode;
  collapsedWidth?: string;
}

export function CollapsiblePanel({
  side,
  isOpen,
  onToggle,
  width = side === 'left' ? 'w-64' : 'w-72',
  children,
  className,
  collapsedContent,
  collapsedWidth = 'w-16',
}: CollapsiblePanelProps) {
  const ChevronClosed = side === 'left' ? ChevronRight : ChevronLeft;

  if (!isOpen && !collapsedContent) {
    return (
      <Button
        variant="tertiary"
        size="sm"
        isIconOnly
        onPress={onToggle}
        className={cn(
          'fixed top-4 z-50 shadow-md bg-surface',
          side === 'left' ? 'left-4' : 'right-4'
        )}
        aria-label={`Expand ${side} panel`}
      >
        <ChevronClosed className="h-4 w-4 text-foreground" />
      </Button>
    );
  }

  return (
    <aside
      className={cn(
        'h-full flex flex-col overflow-hidden shrink-0',
        'transition-all duration-200 ease-in-out',
        side === 'left' ? 'border-r border-separator' : 'border-l border-separator',
        isOpen ? width : collapsedWidth,
        className
      )}
    >
      {isOpen ? children : collapsedContent}
    </aside>
  );
}

interface CollapsiblePanelHeaderProps {
  side: 'left' | 'right';
  onToggle: () => void;
  title: string;
  children?: ReactNode;
  className?: string;
}

export function CollapsiblePanelHeader({
  side,
  onToggle,
  title,
  children,
  className,
}: CollapsiblePanelHeaderProps) {
  const ChevronIcon = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <div className={cn('p-4 border-b border-separator bg-surface min-w-64', className)}>
      <div className="flex items-center justify-between">
        {side === 'left' ? (
          <>
            <h2 className="font-semibold text-lg whitespace-nowrap text-foreground">{title}</h2>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              onPress={onToggle}
              aria-label="Collapse panel"
            >
              <ChevronIcon className="h-4 w-4 text-foreground" />
            </Button>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-foreground whitespace-nowrap">{title}</h3>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              onPress={onToggle}
              aria-label="Collapse panel"
            >
              <ChevronIcon className="h-4 w-4 text-foreground" />
            </Button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
