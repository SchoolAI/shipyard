import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useResizablePanel } from '../../hooks/use-resizable-panel';
import { useUIStore } from '../../stores';

interface DiffPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface DiffPanelHandle {
  focus: () => void;
}

type DiffTab = 'unstaged' | 'staged';

const TABS: DiffTab[] = ['unstaged', 'staged'];

export const DiffPanel = forwardRef<DiffPanelHandle, DiffPanelProps>(function DiffPanel(
  { isOpen, onClose },
  ref
) {
  const [activeTab, setActiveTab] = useState<DiffTab>('unstaged');
  const contentRef = useRef<HTMLDivElement>(null);

  const diffPanelWidth = useUIStore((s) => s.diffPanelWidth);
  const setDiffPanelWidth = useUIStore((s) => s.setDiffPanelWidth);

  const { panelRef, separatorProps, panelStyle, isDragging } = useResizablePanel({
    isOpen,
    width: diffPanelWidth,
    onWidthChange: setDiffPanelWidth,
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => contentRef.current?.focus(),
    }),
    []
  );

  const handleTablistKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      e.preventDefault();
      const currentIndex = TABS.indexOf(activeTab);
      const nextIndex =
        e.key === 'ArrowRight'
          ? (currentIndex + 1) % TABS.length
          : (currentIndex - 1 + TABS.length) % TABS.length;
      const nextTab = TABS[nextIndex];
      if (nextTab) {
        setActiveTab(nextTab);
        document.getElementById(`diff-tab-${nextTab}`)?.focus();
      }
    },
    [activeTab]
  );

  return (
    <aside
      ref={panelRef}
      aria-label="Diff panel"
      aria-hidden={!isOpen}
      inert={!isOpen || undefined}
      style={panelStyle}
      className={`relative shrink-0 border-l border-separator bg-background overflow-hidden h-full max-sm:fixed max-sm:inset-0 max-sm:z-30 max-sm:w-full! max-sm:h-full! max-sm:border-l-0 ${
        isDragging ? '' : 'motion-safe:transition-[width] motion-safe:duration-300 ease-in-out'
      }`}
    >
      {/* Drag handle / separator */}
      {isOpen && <div {...separatorProps} />}

      <div className="flex flex-col h-full min-w-0 sm:min-w-[400px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
          <span className="text-xs text-muted font-medium">Uncommitted changes</span>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label="Close diff panel"
            onPress={onClose}
            className="text-muted hover:text-foreground hover:bg-default w-11 h-11 sm:w-8 sm:h-8 min-w-0"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Change categories"
          className="flex border-b border-separator/50"
          onKeyDown={handleTablistKeyDown}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unstaged'}
            aria-controls="diff-tabpanel-unstaged"
            id="diff-tab-unstaged"
            tabIndex={activeTab === 'unstaged' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
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
            tabIndex={activeTab === 'staged' ? 0 : -1}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
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
          ref={contentRef}
          role="tabpanel"
          id={`diff-tabpanel-${activeTab}`}
          aria-labelledby={`diff-tab-${activeTab}`}
          tabIndex={isOpen ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClose();
            }
          }}
          className="flex flex-col items-center justify-center flex-1 gap-2 px-4 focus-visible-ring"
        >
          <p className="text-sm text-muted">No {activeTab} changes</p>
          <p className="text-xs text-muted/60">Code changes will appear here</p>
        </div>
      </div>
    </aside>
  );
});
