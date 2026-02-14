import { Button } from '@heroui/react';
import { Terminal, X } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface TerminalPanelHandle {
  focus: () => void;
}

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(
  function TerminalPanel({ isOpen, onClose }, ref) {
    const contentRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => contentRef.current?.focus(),
      }),
      []
    );

    return (
      <div
        role="region"
        aria-label="Terminal"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
        className={`shrink-0 border-t border-separator bg-background motion-safe:transition-[height] motion-safe:duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'h-[40dvh]' : 'h-0'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
          <div className="flex items-center gap-2 text-xs text-muted font-medium">
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            Terminal
          </div>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Close terminal"
            onPress={onClose}
            className="text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div
          ref={contentRef}
          role="region"
          aria-label="Terminal output"
          tabIndex={isOpen ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClose();
            }
          }}
          className="flex items-center justify-center h-[calc(100%-37px)] text-sm text-muted focus-visible-ring"
        >
          Terminal will appear here
        </div>
      </div>
    );
  }
);
