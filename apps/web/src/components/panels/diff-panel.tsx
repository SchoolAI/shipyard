import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import { useState } from 'react';

interface DiffPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type DiffTab = 'unstaged' | 'staged';

export function DiffPanel({ isOpen, onClose }: DiffPanelProps) {
  const [activeTab, setActiveTab] = useState<DiffTab>('unstaged');

  return (
    <div
      className={`shrink-0 border-l border-separator bg-background transition-[width] duration-300 ease-in-out overflow-hidden h-full ${
        isOpen ? 'w-[40vw] min-w-[400px] max-sm:w-full max-sm:min-w-0' : 'w-0'
      }`}
    >
      <div className="flex flex-col h-full min-w-[400px] max-sm:min-w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
          <span className="text-xs text-muted font-medium">Uncommitted changes</span>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Close diff panel"
            onPress={onClose}
            className="text-muted hover:text-foreground hover:bg-default w-6 h-6 min-w-0"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex border-b border-separator/50">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unstaged'}
            aria-controls="diff-tabpanel-unstaged"
            id="diff-tab-unstaged"
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'unstaged'
                ? 'text-foreground border-b-2 border-accent'
                : 'text-muted hover:text-foreground'
            }`}
            onClick={() => setActiveTab('unstaged')}
          >
            Unstaged
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'staged'}
            aria-controls="diff-tabpanel-staged"
            id="diff-tab-staged"
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'staged'
                ? 'text-foreground border-b-2 border-accent'
                : 'text-muted hover:text-foreground'
            }`}
            onClick={() => setActiveTab('staged')}
          >
            Staged
          </button>
        </div>

        {/* Tab panel */}
        <div
          role="tabpanel"
          id={`diff-tabpanel-${activeTab}`}
          aria-labelledby={`diff-tab-${activeTab}`}
          className="flex flex-col items-center justify-center flex-1 gap-2 px-4"
        >
          <p className="text-sm text-muted">No {activeTab} changes</p>
          <p className="text-xs text-muted/60">Code changes will appear here</p>
        </div>
      </div>
    </div>
  );
}
