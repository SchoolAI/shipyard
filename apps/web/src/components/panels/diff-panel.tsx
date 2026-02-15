import { Button, Tooltip } from '@heroui/react';
import type { DiffFile } from '@shipyard/loro-schema';
import { ChevronDown, ChevronRight, WrapText, X } from 'lucide-react';
import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useResizablePanel } from '../../hooks/use-resizable-panel';
import { useTaskDocument } from '../../hooks/use-task-document';
import { useUIStore } from '../../stores';

const SM_BREAKPOINT = 640;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < SM_BREAKPOINT
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SM_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

interface DiffPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTaskId: string | null;
}

export interface DiffPanelHandle {
  focus: () => void;
}

type DiffTab = 'unstaged' | 'staged';

const TABS: DiffTab[] = ['unstaged', 'staged'];

function classifyLine(line: string): 'add' | 'remove' | 'hunk' | 'header' | 'context' {
  if (line.startsWith('--- ') || line.startsWith('+++ ')) return 'header';
  if (line.startsWith('diff --git')) return 'header';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  if (line.startsWith('@@')) return 'hunk';
  return 'context';
}

const LINE_STYLES = {
  add: 'bg-diff-add-bg text-diff-add-fg',
  remove: 'bg-diff-remove-bg text-diff-remove-fg',
  hunk: 'bg-diff-hunk-bg text-diff-hunk-fg font-medium',
  header: 'text-muted font-medium',
  context: '',
} as const;

function DiffContent({ rawDiff, wordWrap }: { rawDiff: string; wordWrap: boolean }) {
  const lines = rawDiff.split('\n');
  return (
    <pre
      className={`text-xs font-mono leading-relaxed ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'}`}
    >
      {lines.map((line, i) => {
        const kind = classifyLine(line);
        return (
          <div key={i} className={`px-4 ${LINE_STYLES[kind]}`}>
            {line || '\u00A0'}
          </div>
        );
      })}
    </pre>
  );
}

const STATUS_COLORS: Record<string, string> = {
  M: 'text-warning',
  A: 'text-success',
  D: 'text-danger',
  R: 'text-secondary',
  C: 'text-secondary',
  MM: 'text-warning',
  AM: 'text-success',
  AD: 'text-danger',
  UU: 'text-danger',
  '??': 'text-muted',
};

function FileList({
  files,
  isOpen,
  onToggle,
}: {
  files: readonly DiffFile[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (files.length === 0) return null;
  const Icon = isOpen ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-separator/50">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-muted hover:text-foreground transition-colors"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <Icon className="w-3 h-3" />
        <span className="font-medium">
          {files.length} file{files.length !== 1 ? 's' : ''} changed
        </span>
      </button>
      {isOpen && (
        <div role="list" className="pb-2">
          {files.map((file) => (
            <div
              key={file.path}
              role="listitem"
              className="flex items-center gap-2 px-6 py-0.5 text-xs"
            >
              <span className={`font-mono ${STATUS_COLORS[file.status] ?? 'text-muted'}`}>
                {file.status}
              </span>
              <span className="text-foreground/80 truncate">{file.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4">
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

function TabPanelContent({
  activeTaskId,
  activeTab,
  activeDiff,
  updatedAt,
  files,
  isFileListOpen,
  onToggleFileList,
  wordWrap,
}: {
  activeTaskId: string | null;
  activeTab: DiffTab;
  activeDiff: string | undefined;
  updatedAt: number | undefined;
  files: readonly DiffFile[];
  isFileListOpen: boolean;
  onToggleFileList: () => void;
  wordWrap: boolean;
}) {
  if (!activeTaskId) return <EmptyState message="Select a task to see changes" />;
  if (!updatedAt) return <EmptyState message="Code changes will appear here" />;
  if (!activeDiff) return <EmptyState message={`No ${activeTab} changes`} />;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <FileList files={files} isOpen={isFileListOpen} onToggle={onToggleFileList} />
      <DiffContent rawDiff={activeDiff} wordWrap={wordWrap} />
    </div>
  );
}

function getAsideClassName(isMobile: boolean, isOpen: boolean, isDragging: boolean): string {
  const base = 'shrink-0 bg-background overflow-hidden';
  if (isMobile) {
    return `${base} fixed inset-0 z-30 ${isOpen ? '' : 'hidden'}`;
  }
  const transition = isDragging
    ? ''
    : 'motion-safe:transition-[width] motion-safe:duration-300 ease-in-out';
  return `${base} relative h-full border-l border-separator ${transition}`;
}

export const DiffPanel = forwardRef<DiffPanelHandle, DiffPanelProps>(function DiffPanel(
  { isOpen, onClose, activeTaskId },
  ref
) {
  const [activeTab, setActiveTab] = useState<DiffTab>('unstaged');
  const [isFileListOpen, setIsFileListOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const diffPanelWidth = useUIStore((s) => s.diffPanelWidth);
  const setDiffPanelWidth = useUIStore((s) => s.setDiffPanelWidth);
  const diffWordWrap = useUIStore((s) => s.diffWordWrap);
  const setDiffWordWrap = useUIStore((s) => s.setDiffWordWrap);

  const isMobile = useIsMobile();

  const { panelRef, separatorProps, panelStyle, isDragging } = useResizablePanel({
    isOpen,
    width: diffPanelWidth,
    onWidthChange: setDiffPanelWidth,
  });

  const { diffState } = useTaskDocument(activeTaskId);

  const activeDiff = activeTab === 'unstaged' ? diffState?.unstaged : diffState?.staged;
  const files = diffState?.files ?? [];

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
      style={isMobile ? undefined : panelStyle}
      className={getAsideClassName(isMobile, isOpen, isDragging)}
    >
      {isOpen && !isMobile && <div {...separatorProps} />}

      <div className="flex flex-col h-full min-w-0 sm:min-w-[400px]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
          <span className="text-xs text-muted font-medium">Uncommitted changes</span>
          <div className="flex items-center gap-1">
            <Tooltip delay={0}>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label={diffWordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                onPress={() => setDiffWordWrap(!diffWordWrap)}
                className={`text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0 ${diffWordWrap ? 'text-accent' : ''}`}
              >
                <WrapText className="w-3.5 h-3.5" />
              </Button>
              <Tooltip.Content>
                {diffWordWrap ? 'Disable word wrap' : 'Enable word wrap'}
              </Tooltip.Content>
            </Tooltip>
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
        </div>

        <div
          role="tablist"
          aria-label="Change categories"
          className="flex border-b border-separator/50"
          onKeyDown={handleTablistKeyDown}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`diff-tabpanel-${tab}`}
              id={`diff-tab-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'text-foreground border-b-2 border-accent'
                  : 'text-muted hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'unstaged' ? 'Unstaged' : 'Staged'}
            </button>
          ))}
        </div>

        <div
          ref={contentRef}
          role="tabpanel"
          id={`diff-tabpanel-${activeTab}`}
          aria-labelledby={`diff-tab-${activeTab}`}
          tabIndex={isOpen ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          className="flex flex-col flex-1 min-h-0 focus-visible-ring"
        >
          <TabPanelContent
            activeTaskId={activeTaskId}
            activeTab={activeTab}
            activeDiff={activeDiff}
            updatedAt={diffState?.updatedAt}
            files={files}
            isFileListOpen={isFileListOpen}
            onToggleFileList={() => setIsFileListOpen((v) => !v)}
            wordWrap={diffWordWrap}
          />
        </div>
      </div>
    </aside>
  );
});
