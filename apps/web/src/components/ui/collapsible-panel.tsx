import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  /** Which side the panel is on */
  side: 'left' | 'right';
  /** Whether the panel is open */
  isOpen: boolean;
  /** Toggle the panel */
  onToggle: () => void;
  /** Panel width when open (Tailwind class like 'w-64' or 'w-72') */
  width?: string;
  /** Panel content */
  children: ReactNode;
  /** Optional className for the panel */
  className?: string;
}

/**
 * Collapsible side panel with consistent animation.
 * Used for both left sidebar and right comments panel.
 */
export function CollapsiblePanel({
  side,
  isOpen,
  onToggle,
  width = side === 'left' ? 'w-64' : 'w-72',
  children,
  className,
}: CollapsiblePanelProps) {
  const ChevronClosed = side === 'left' ? ChevronRight : ChevronLeft;

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={onToggle}
        className={cn(
          'fixed top-4 z-50 shadow-md bg-white',
          side === 'left' ? 'left-4' : 'right-4'
        )}
        aria-label={`Expand ${side} panel`}
      >
        <ChevronClosed className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <aside
      className={cn(
        'h-full flex flex-col overflow-hidden shrink-0',
        'transition-all duration-200 ease-in-out',
        side === 'left' ? 'border-r border-slate-200' : 'border-l border-slate-200',
        width,
        className
      )}
    >
      {children}
    </aside>
  );
}

interface CollapsiblePanelHeaderProps {
  /** Panel side for chevron direction */
  side: 'left' | 'right';
  /** Toggle callback */
  onToggle: () => void;
  /** Header title */
  title: string;
  /** Optional subtitle or additional content */
  children?: ReactNode;
  /** Optional className */
  className?: string;
}

/**
 * Header component for CollapsiblePanel with built-in collapse button.
 */
export function CollapsiblePanelHeader({
  side,
  onToggle,
  title,
  children,
  className,
}: CollapsiblePanelHeaderProps) {
  const ChevronIcon = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <div className={cn('p-4 border-b border-slate-200 bg-white min-w-64', className)}>
      <div className="flex items-center justify-between">
        {side === 'left' ? (
          <>
            <h2 className="font-semibold text-lg whitespace-nowrap">{title}</h2>
            <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse panel">
              <ChevronIcon className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-slate-900 whitespace-nowrap">{title}</h3>
            <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse panel">
              <ChevronIcon className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
