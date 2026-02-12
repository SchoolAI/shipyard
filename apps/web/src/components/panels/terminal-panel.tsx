import { Button } from '@heroui/react';
import { Terminal, X } from 'lucide-react';

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TerminalPanel({ isOpen, onClose }: TerminalPanelProps) {
  return (
    <div
      className={`shrink-0 border-t border-separator bg-background transition-[height] duration-300 ease-in-out overflow-hidden ${
        isOpen ? 'h-[40dvh]' : 'h-0'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
        <div className="flex items-center gap-2 text-xs text-muted font-medium">
          <Terminal className="w-3.5 h-3.5" />
          Terminal
        </div>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Close terminal"
          onPress={onClose}
          className="text-muted hover:text-foreground hover:bg-default w-6 h-6 min-w-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex items-center justify-center h-[calc(100%-37px)] text-sm text-muted">
        Terminal will appear here
      </div>
    </div>
  );
}
