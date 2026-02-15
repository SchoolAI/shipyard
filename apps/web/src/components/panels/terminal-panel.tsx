import { Button } from '@heroui/react';
import { Terminal, X } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useVerticalResizablePanel } from '../../hooks/use-vertical-resizable-panel';
import { useUIStore } from '../../stores';

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

    const terminalPanelHeight = useUIStore((s) => s.terminalPanelHeight);
    const setTerminalPanelHeight = useUIStore((s) => s.setTerminalPanelHeight);

    const { panelRef, separatorProps, panelStyle, isDragging } =
      useVerticalResizablePanel<HTMLDivElement>({
        isOpen,
        height: terminalPanelHeight,
        onHeightChange: setTerminalPanelHeight,
      });

    useImperativeHandle(
      ref,
      () => ({
        focus: () => contentRef.current?.focus(),
      }),
      []
    );

    return (
      <div
        ref={panelRef}
        role="region"
        aria-label="Terminal"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
        style={panelStyle}
        className={`relative shrink-0 bg-background hidden sm:block ${
          isOpen ? 'border-t border-separator' : ''
        } ${isDragging ? '' : 'motion-safe:transition-[height] motion-safe:duration-300 ease-in-out'}`}
      >
        {/* Drag handle / separator (desktop only) */}
        {isOpen && <div {...separatorProps} />}

        <div className="overflow-hidden h-full">
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
              className="text-muted hover:text-foreground hover:bg-default w-11 h-11 sm:w-8 sm:h-8 min-w-0"
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
      </div>
    );
  }
);
