import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Button, Tooltip } from '@heroui/react';
import type { DiffState, DiffFile as SchemaDiffFile } from '@shipyard/loro-schema';
import { ChevronDown, ChevronRight, Columns2, Rows3, WrapText, X } from 'lucide-react';
import {
  forwardRef,
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useResizablePanel } from '../../hooks/use-resizable-panel';
import { useTaskDocument } from '../../hooks/use-task-document';
import type { DiffScope, DiffViewType } from '../../stores';
import { useUIStore } from '../../stores';

const SM_BREAKPOINT = 640;
const SPLIT_MIN_WIDTH = 800;

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

const SCOPE_OPTIONS: { value: DiffScope; label: string }[] = [
  { value: 'working-tree', label: 'Working Tree' },
  { value: 'branch', label: 'Branch Changes' },
  { value: 'last-turn', label: 'Last Turn' },
];

function useTheme(): 'dark' | 'light' {
  const theme = useUIStore((s) => s.theme);
  const [resolved, setResolved] = useState<'dark' | 'light'>(() => {
    if (theme !== 'system') return theme;
    if (typeof window === 'undefined') return 'dark';
    return document.documentElement.classList.contains('light') ? 'light' : 'dark';
  });

  useEffect(() => {
    if (theme !== 'system') {
      setResolved(theme);
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setResolved(mql.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => setResolved(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  return resolved;
}

interface ParsedFileDiff {
  oldFileName: string | null;
  newFileName: string | null;
  hunks: string[];
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  toml: 'toml',
};

function extFromPath(path: string | null): string | null {
  if (!path) return null;
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot + 1) : null;
}

function langFromPath(path: string | null): string | null {
  const ext = extFromPath(path);
  return ext ? LANG_MAP[ext] ?? ext : null;
}

function parseFileDiffs(rawDiff: string): ParsedFileDiff[] {
  const results: ParsedFileDiff[] = [];
  const lines = rawDiff.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (!lines[i]?.startsWith('diff --git ')) {
      i++;
      continue;
    }

    let oldName: string | null = null;
    let newName: string | null = null;
    const hunkLines: string[] = [];

    const diffHeader = lines[i]!;
    hunkLines.push(diffHeader);
    i++;

    while (i < lines.length && !lines[i]?.startsWith('diff --git ')) {
      const line = lines[i]!;
      if (line.startsWith('--- a/')) oldName = line.slice(6);
      else if (line.startsWith('--- /dev/null')) oldName = null;
      else if (line.startsWith('+++ b/')) newName = line.slice(6);
      else if (line.startsWith('+++ /dev/null')) newName = null;
      hunkLines.push(line);
      i++;
    }

    results.push({
      oldFileName: oldName,
      newFileName: newName,
      hunks: [hunkLines.join('\n')],
    });
  }

  return results;
}

const DiffContent = memo(function DiffContent({
  rawDiff,
  wordWrap,
  effectiveMode,
}: {
  rawDiff: string;
  wordWrap: boolean;
  effectiveMode: DiffModeEnum;
}) {
  const resolvedTheme = useTheme();

  const fileDiffs = useMemo(() => parseFileDiffs(rawDiff), [rawDiff]);

  return (
    <>
      {fileDiffs.map((fd, idx) => {
        const fileName = fd.newFileName ?? fd.oldFileName;
        const lang = langFromPath(fileName);
        return (
          <DiffView
            key={fileName ?? idx}
            data={{
              oldFile: fd.oldFileName
                ? { fileName: fd.oldFileName, fileLang: langFromPath(fd.oldFileName) }
                : undefined,
              newFile: fd.newFileName
                ? { fileName: fd.newFileName, fileLang: lang }
                : undefined,
              hunks: fd.hunks,
            }}
            diffViewMode={effectiveMode}
            diffViewWrap={wordWrap}
            diffViewTheme={resolvedTheme}
            diffViewHighlight
            diffViewFontSize={12}
          />
        );
      })}
    </>
  );
});

function FileList({
  files,
  isOpen,
  onToggle,
}: {
  files: readonly SchemaDiffFile[];
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

function getEmptyMessage(
  scope: DiffScope,
  activeTab: DiffTab,
  diffState: DiffState | null
): string | null {
  switch (scope) {
    case 'working-tree':
      return `No ${activeTab} changes`;
    case 'branch':
      if (!diffState?.branchBase) return 'Could not detect base branch';
      return 'No committed changes on this branch';
    case 'last-turn':
      if (!diffState?.lastTurnUpdatedAt) return 'No turn changes captured yet';
      return 'No changes in the last turn';
  }
}

function getDiffData(
  scope: DiffScope,
  activeTab: DiffTab,
  diffState: DiffState | null
): { diff: string | undefined; files: readonly SchemaDiffFile[]; updatedAt: number | undefined } {
  if (!diffState) return { diff: undefined, files: [], updatedAt: undefined };

  switch (scope) {
    case 'working-tree':
      return {
        diff: activeTab === 'unstaged' ? diffState.unstaged : diffState.staged,
        files: diffState.files,
        updatedAt: diffState.updatedAt,
      };
    case 'branch':
      return {
        diff: diffState.branchDiff,
        files: diffState.branchFiles,
        updatedAt: diffState.branchUpdatedAt,
      };
    case 'last-turn':
      return {
        diff: diffState.lastTurnDiff,
        files: diffState.lastTurnFiles,
        updatedAt: diffState.lastTurnUpdatedAt,
      };
  }
}

function TabPanelContent({
  activeTaskId,
  activeTab,
  scope,
  diffState,
  isFileListOpen,
  onToggleFileList,
  wordWrap,
  viewType,
  panelWidth,
}: {
  activeTaskId: string | null;
  activeTab: DiffTab;
  scope: DiffScope;
  diffState: DiffState | null;
  isFileListOpen: boolean;
  onToggleFileList: () => void;
  wordWrap: boolean;
  viewType: DiffViewType;
  panelWidth: number;
}) {
  const { diff, files, updatedAt } = getDiffData(scope, activeTab, diffState);

  if (!activeTaskId) return <EmptyState message="Select a task to see changes" />;
  if (!updatedAt) return <EmptyState message="Code changes will appear here" />;
  if (!diff) {
    const msg = getEmptyMessage(scope, activeTab, diffState);
    return <EmptyState message={msg ?? 'No changes'} />;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <FileList files={files} isOpen={isFileListOpen} onToggle={onToggleFileList} />
      <DiffContent
        rawDiff={diff}
        wordWrap={wordWrap}
        effectiveMode={
          viewType === 'split' && panelWidth >= SPLIT_MIN_WIDTH
            ? DiffModeEnum.Split
            : DiffModeEnum.Unified
        }
      />
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
    : 'motion-safe:transition-[width] motion-safe:duration-200 ease-out';
  const border = isOpen ? 'border-l border-separator' : '';
  return `${base} relative h-full ${border} ${transition}`;
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
  const diffScope = useUIStore((s) => s.diffScope);
  const setDiffScope = useUIStore((s) => s.setDiffScope);
  const diffViewType = useUIStore((s) => s.diffViewType);
  const setDiffViewType = useUIStore((s) => s.setDiffViewType);

  const isMobile = useIsMobile();

  const { panelRef, separatorProps, panelStyle, clampedWidth, isDragging } = useResizablePanel({
    isOpen,
    width: diffPanelWidth,
    onWidthChange: setDiffPanelWidth,
  });

  const { diffState } = useTaskDocument(activeTaskId);

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

  const isSplitViewActive = diffViewType === 'split';
  const SplitIcon = isSplitViewActive ? Rows3 : Columns2;
  const splitLabel = isSplitViewActive ? 'Switch to unified view' : 'Switch to split view';

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

      {isOpen && (
        <div className="flex flex-col h-full min-w-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
            <select
              aria-label="Diff scope"
              value={diffScope}
              onChange={(e) => setDiffScope(e.target.value as DiffScope)}
              className="text-xs text-muted font-medium bg-transparent border-none outline-none cursor-pointer hover:text-foreground transition-colors"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <Tooltip delay={0}>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label={splitLabel}
                  onPress={() => setDiffViewType(isSplitViewActive ? 'unified' : 'split')}
                  className={`text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0 ${isSplitViewActive ? 'text-accent' : ''}`}
                >
                  <SplitIcon className="w-3.5 h-3.5" />
                </Button>
                <Tooltip.Content>{splitLabel}</Tooltip.Content>
              </Tooltip>
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

          {diffScope === 'working-tree' && (
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
          )}

          <div
            ref={contentRef}
            role="tabpanel"
            id={`diff-tabpanel-${activeTab}`}
            aria-labelledby={`diff-tab-${activeTab}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            className="flex flex-col flex-1 min-h-0 focus-visible-ring"
          >
            <TabPanelContent
              activeTaskId={activeTaskId}
              activeTab={activeTab}
              scope={diffScope}
              diffState={diffState}
              isFileListOpen={isFileListOpen}
              onToggleFileList={() => setIsFileListOpen((v) => !v)}
              wordWrap={diffWordWrap}
              viewType={diffViewType}
              panelWidth={clampedWidth}
            />
          </div>
        </div>
      )}
    </aside>
  );
});
