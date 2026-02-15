import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Button, Tooltip } from '@heroui/react';
import type { DiffState, DiffFile as SchemaDiffFile } from '@shipyard/loro-schema';
import { Columns2, PanelLeft, Rows3, WrapText, X } from 'lucide-react';
import {
  forwardRef,
  type KeyboardEvent,
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
import { assertNever } from '../../utils/assert-never';
import { DiffFileTree } from './diff-file-tree';

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

function splitDiffByFile(rawDiff: string): string[] {
  const segments: string[] = [];
  let current = '';
  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('diff --git ') && current) {
      segments.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current.trim()) segments.push(current);
  return segments;
}

function extractFilePath(diffSegment: string): string | null {
  const match = diffSegment.match(/^diff --git a\/(.+?) b\//m);
  if (match?.[1]) return match[1];

  /** Fallback: extract from the +++ line (handles renames and edge cases) */
  const plusMatch = diffSegment.match(/^\+\+\+ b\/(.+)$/m);
  if (plusMatch?.[1]) return plusMatch[1];

  return null;
}

/**
 * Strip git-quoted paths (`"path"` -> `path`), unescape octal sequences,
 * and remove trailing slashes.
 */
function normalizePath(p: string): string {
  let cleaned = p;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned
      .slice(1, -1)
      .replace(/\\([0-7]{3})/g, (_match, oct: string) =>
        String.fromCharCode(Number.parseInt(oct, 8))
      );
  }
  return cleaned.replace(/\/+$/, '');
}

/** Build a set of file paths that actually appear in the diff text. */
function extractDiffPaths(rawDiff: string): Set<string> {
  const paths = new Set<string>();
  for (const seg of splitDiffByFile(rawDiff)) {
    const p = extractFilePath(seg);
    if (p) paths.add(normalizePath(p));
  }
  return paths;
}

function filterDiffByFile(rawDiff: string, filePath: string): string {
  const segments = splitDiffByFile(rawDiff);
  const normalized = normalizePath(filePath);
  const match = segments.find((seg) => {
    const segPath = extractFilePath(seg);
    return segPath !== null && normalizePath(segPath) === normalized;
  });
  return match ?? '';
}

function DiffContent({
  rawDiff,
  wordWrap,
  viewType,
  panelWidth,
  selectedFile,
}: {
  rawDiff: string;
  wordWrap: boolean;
  viewType: DiffViewType;
  panelWidth: number;
  selectedFile: string | null;
}) {
  const resolvedTheme = useTheme();

  const effectiveMode =
    viewType === 'split' && panelWidth >= SPLIT_MIN_WIDTH
      ? DiffModeEnum.Split
      : DiffModeEnum.Unified;

  const data = useMemo(() => {
    if (selectedFile) {
      const filtered = filterDiffByFile(rawDiff, selectedFile);
      return { hunks: filtered ? [filtered] : [] };
    }
    return { hunks: splitDiffByFile(rawDiff) };
  }, [rawDiff, selectedFile]);

  if (data.hunks.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-muted">
        No changes for this file
      </div>
    );
  }

  return (
    <DiffView
      data={data}
      diffViewMode={effectiveMode}
      diffViewWrap={wordWrap}
      diffViewTheme={resolvedTheme}
      diffViewHighlight
      diffViewFontSize={12}
    />
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
    default:
      return assertNever(scope);
  }
}

function getDiffData(
  scope: DiffScope,
  activeTab: DiffTab,
  diffState: DiffState | null
): { diff: string | undefined; files: readonly SchemaDiffFile[]; updatedAt: number | undefined } {
  if (!diffState) return { diff: undefined, files: [], updatedAt: undefined };

  switch (scope) {
    case 'working-tree': {
      const diff = activeTab === 'unstaged' ? diffState.unstaged : diffState.staged;
      return {
        diff,
        files: diffState.files,
        updatedAt: diffState.updatedAt,
      };
    }
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
    default:
      return assertNever(scope);
  }
}

function DiffBody({
  activeTaskId,
  activeTab,
  scope,
  diffState,
  wordWrap,
  viewType,
  panelWidth,
  selectedFile,
  onSelectFile,
  isFileTreeOpen,
  fileTreeWidth,
}: {
  activeTaskId: string | null;
  activeTab: DiffTab;
  scope: DiffScope;
  diffState: DiffState | null;
  wordWrap: boolean;
  viewType: DiffViewType;
  panelWidth: number;
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
  isFileTreeOpen: boolean;
  fileTreeWidth: number;
}) {
  const { diff, files, updatedAt } = getDiffData(scope, activeTab, diffState);

  /**
   * For working-tree scope the daemon stores a single file list for both tabs,
   * but the diff text is tab-specific.  Filter the tree to only files that
   * actually have content in the current diff so clicking a file always shows
   * something (untracked `??` files only appear in the unstaged diff, fully
   * staged files only in the staged diff, etc.).
   */
  const diffPaths = useMemo(() => (diff ? extractDiffPaths(diff) : new Set<string>()), [diff]);
  const visibleFiles = useMemo(
    () =>
      scope === 'working-tree' ? files.filter((f) => diffPaths.has(normalizePath(f.path))) : files,
    [scope, files, diffPaths]
  );

  if (!activeTaskId) return <EmptyState message="Select a task to see changes" />;
  if (!updatedAt) return <EmptyState message="Code changes will appear here" />;
  if (!diff) {
    const msg = getEmptyMessage(scope, activeTab, diffState);
    return <EmptyState message={msg ?? 'No changes'} />;
  }

  return (
    <div className="flex flex-1 min-h-0">
      {isFileTreeOpen && visibleFiles.length > 0 && (
        <DiffFileTree
          files={visibleFiles}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
          width={fileTreeWidth}
        />
      )}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <DiffContent
          rawDiff={diff}
          wordWrap={wordWrap}
          viewType={viewType}
          panelWidth={panelWidth}
          selectedFile={selectedFile}
        />
      </div>
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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const diffPanelWidth = useUIStore((s) => s.diffPanelWidth);
  const setDiffPanelWidth = useUIStore((s) => s.setDiffPanelWidth);
  const diffWordWrap = useUIStore((s) => s.diffWordWrap);
  const setDiffWordWrap = useUIStore((s) => s.setDiffWordWrap);
  const diffScope = useUIStore((s) => s.diffScope);
  const setDiffScope = useUIStore((s) => s.setDiffScope);
  const diffViewType = useUIStore((s) => s.diffViewType);
  const setDiffViewType = useUIStore((s) => s.setDiffViewType);
  const isDiffFileTreeOpen = useUIStore((s) => s.isDiffFileTreeOpen);
  const toggleDiffFileTree = useUIStore((s) => s.toggleDiffFileTree);
  const diffFileTreeWidth = useUIStore((s) => s.diffFileTreeWidth);

  const isMobile = useIsMobile();

  const { panelRef, separatorProps, panelStyle, isDragging } = useResizablePanel({
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

  useEffect(() => {
    setSelectedFile(null);
  }, [diffScope, activeTab, activeTaskId]);

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
  const fileTreeLabel = isDiffFileTreeOpen ? 'Hide file tree' : 'Show file tree';

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
          <div className="flex items-center gap-2">
            <Tooltip delay={0}>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label={fileTreeLabel}
                onPress={toggleDiffFileTree}
                className={`text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0 ${isDiffFileTreeOpen ? 'text-accent' : ''}`}
              >
                <PanelLeft className="w-3.5 h-3.5" />
              </Button>
              <Tooltip.Content>{fileTreeLabel}</Tooltip.Content>
            </Tooltip>
            <select
              aria-label="Diff scope"
              value={diffScope}
              onChange={(e) => {
                const value = e.target.value;
                const validScope = SCOPE_OPTIONS.find((opt) => opt.value === value);
                if (validScope) setDiffScope(validScope.value);
              }}
              className="text-xs text-muted font-medium bg-transparent border-none outline-none cursor-pointer hover:text-foreground transition-colors color-inherit [&_option]:bg-surface [&_option]:text-foreground"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
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
          {...(diffScope === 'working-tree'
            ? {
                role: 'tabpanel' as const,
                id: `diff-tabpanel-${activeTab}`,
                'aria-labelledby': `diff-tab-${activeTab}`,
              }
            : {
                role: 'region' as const,
                'aria-label': 'Diff content',
              })}
          tabIndex={isOpen ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          className="flex flex-col flex-1 min-h-0 focus-visible-ring"
        >
          <DiffBody
            activeTaskId={activeTaskId}
            activeTab={activeTab}
            scope={diffScope}
            diffState={diffState}
            wordWrap={diffWordWrap}
            viewType={diffViewType}
            panelWidth={diffPanelWidth}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            isFileTreeOpen={isDiffFileTreeOpen && !isMobile}
            fileTreeWidth={diffFileTreeWidth}
          />
        </div>
      </div>
    </aside>
  );
});
