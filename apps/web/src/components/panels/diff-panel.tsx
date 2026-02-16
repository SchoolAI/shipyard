import { DiffModeEnum, DiffView, SplitSide } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Label, Popover, Switch, Tooltip } from '@heroui/react';
import type {
  DiffComment,
  DiffCommentSide,
  DiffState,
  DiffFile as SchemaDiffFile,
} from '@shipyard/loro-schema';
import { MessageSquare, PanelLeft, Settings2 } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSidePanelToolbarSlot } from '../../contexts/side-panel-toolbar-context';
import { useTaskDocument } from '../../hooks/use-task-document';
import type { DiffScope, DiffViewType } from '../../stores';
import { useUIStore } from '../../stores';
import { assertNever } from '../../utils/assert-never';
import { DiffCommentInput } from '../diff/diff-comment-input';
import { DiffCommentWidget } from '../diff/diff-comment-widget';
import { DiffFileTree } from './diff-file-tree';

const SPLIT_MIN_WIDTH = 800;

const SM_BREAKPOINT = 640;

function splitSideToCommentSide(side: SplitSide): DiffCommentSide {
  return side === SplitSide.old ? 'old' : 'new';
}

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

type DiffTab = 'unstaged' | 'staged';

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
  scope,
  diffComments,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  showResolvedComments,
}: {
  rawDiff: string;
  wordWrap: boolean;
  viewType: DiffViewType;
  panelWidth: number;
  selectedFile: string | null;
  scope: DiffScope;
  diffComments: DiffComment[];
  onAddComment: (
    filePath: string,
    lineNumber: number,
    side: DiffCommentSide,
    lineContentHash: string,
    body: string
  ) => void;
  onResolveComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  showResolvedComments: boolean;
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

  const extendData = useMemo(() => {
    const oldFile: Record<string, { data: DiffComment[] }> = {};
    const newFile: Record<string, { data: DiffComment[] }> = {};

    for (const comment of diffComments) {
      if (selectedFile && comment.filePath !== selectedFile) continue;
      const target = comment.side === 'old' ? oldFile : newFile;
      const key = String(comment.lineNumber);
      if (!target[key]) target[key] = { data: [] };
      target[key].data.push(comment);
    }

    return { oldFile, newFile };
  }, [diffComments, selectedFile]);

  const renderExtendLine = useCallback(
    ({
      data: comments,
    }: {
      data: DiffComment[];
      side: SplitSide;
      lineNumber: number;
      diffFile: unknown;
      onUpdate: () => void;
    }) => (
      <DiffCommentWidget
        comments={comments}
        onResolve={onResolveComment}
        onDelete={onDeleteComment}
        showResolved={showResolvedComments}
      />
    ),
    [onResolveComment, onDeleteComment, showResolvedComments]
  );

  const renderWidgetLine = useCallback(
    ({
      diffFile,
      side,
      lineNumber,
      onClose,
    }: {
      diffFile: { _newFileName?: string; _oldFileName?: string };
      side: SplitSide;
      lineNumber: number;
      onClose: () => void;
    }) => (
      <DiffCommentInput
        onSubmit={(body) => {
          const filePath = diffFile._newFileName ?? diffFile._oldFileName ?? '';
          const commentSide = splitSideToCommentSide(side);
          onAddComment(filePath, lineNumber, commentSide, '', body);
          onClose();
        }}
        onCancel={onClose}
      />
    ),
    [onAddComment]
  );

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
      diffViewHighlight={false}
      diffViewFontSize={12}
      diffViewAddWidget={scope !== 'branch'}
      extendData={extendData}
      renderExtendLine={renderExtendLine}
      renderWidgetLine={renderWidgetLine}
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

function DiffActionBar({
  fileCount,
  isFileTreeOpen,
  onToggleFileTree,
  diffViewType,
  setDiffViewType,
  diffWordWrap,
  setDiffWordWrap,
  showResolvedComments,
  toggleResolvedComments,
  unresolvedCommentCount,
}: {
  fileCount: number;
  isFileTreeOpen: boolean;
  onToggleFileTree: () => void;
  diffViewType: DiffViewType;
  setDiffViewType: (type: DiffViewType) => void;
  diffWordWrap: boolean;
  setDiffWordWrap: (wrap: boolean) => void;
  showResolvedComments: boolean;
  toggleResolvedComments: () => void;
  unresolvedCommentCount: number;
}) {
  const fileTreeLabel = isFileTreeOpen ? 'Hide files' : 'Show files';

  return (
    <div className="h-7 px-2 flex items-center justify-between border-b border-separator/50">
      <div className="flex items-center gap-1">
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <button
              type="button"
              aria-label={fileTreeLabel}
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors px-1 py-0.5 rounded min-w-7 min-h-7"
              onClick={onToggleFileTree}
            >
              <PanelLeft className="w-3.5 h-3.5" />
              {!isFileTreeOpen && <span className="text-xs font-medium">Files ({fileCount})</span>}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content>{fileTreeLabel}</Tooltip.Content>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1">
        {unresolvedCommentCount > 0 && (
          <span
            role="status"
            aria-label={`${unresolvedCommentCount} unresolved comment${unresolvedCommentCount !== 1 ? 's' : ''}`}
            className="flex items-center gap-1 text-xs text-muted px-1"
          >
            <MessageSquare className="w-3 h-3" />
            {unresolvedCommentCount}
          </span>
        )}

        <Popover>
          <Popover.Trigger>
            <button
              type="button"
              aria-label="Diff settings"
              className="flex items-center justify-center min-w-7 min-h-7 text-muted hover:text-foreground transition-colors rounded"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </Popover.Trigger>
          <Popover.Content placement="bottom end" className="w-48">
            <Popover.Dialog className="p-3">
              <Popover.Heading className="text-xs font-medium mb-2">Diff Settings</Popover.Heading>
              <div className="flex flex-col gap-2">
                <Switch
                  size="sm"
                  isSelected={diffViewType === 'split'}
                  onChange={() => setDiffViewType(diffViewType === 'split' ? 'unified' : 'split')}
                >
                  <Label className="text-xs flex-1">Split view</Label>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
                <Switch
                  size="sm"
                  isSelected={diffWordWrap}
                  onChange={() => setDiffWordWrap(!diffWordWrap)}
                >
                  <Label className="text-xs flex-1">Word wrap</Label>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
                <Switch
                  size="sm"
                  isSelected={showResolvedComments}
                  onChange={toggleResolvedComments}
                >
                  <Label className="text-xs flex-1">Show resolved</Label>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
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
  diffComments,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  showResolvedComments,
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
  diffComments: DiffComment[];
  onAddComment: (
    filePath: string,
    lineNumber: number,
    side: DiffCommentSide,
    lineContentHash: string,
    body: string
  ) => void;
  onResolveComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  showResolvedComments: boolean;
}) {
  const deferredDiffState = useDeferredValue(diffState);
  const deferredSelectedFile = useDeferredValue(selectedFile);
  const isStale = deferredDiffState !== diffState || deferredSelectedFile !== selectedFile;

  const { diff, files, updatedAt } = getDiffData(scope, activeTab, deferredDiffState);

  const diffPaths = useMemo(() => (diff ? extractDiffPaths(diff) : new Set<string>()), [diff]);
  const visibleFiles = useMemo(
    () =>
      scope === 'working-tree' ? files.filter((f) => diffPaths.has(normalizePath(f.path))) : files,
    [scope, files, diffPaths]
  );

  const stagedPaths = useMemo(
    () =>
      scope === 'working-tree' && deferredDiffState?.staged
        ? extractDiffPaths(deferredDiffState.staged)
        : new Set<string>(),
    [scope, deferredDiffState?.staged]
  );
  const unstagedPaths = useMemo(
    () =>
      scope === 'working-tree' && deferredDiffState?.unstaged
        ? extractDiffPaths(deferredDiffState.unstaged)
        : new Set<string>(),
    [scope, deferredDiffState?.unstaged]
  );
  const stagedFiles = useMemo(
    () => files.filter((f) => stagedPaths.has(normalizePath(f.path))),
    [files, stagedPaths]
  );
  const unstagedFiles = useMemo(
    () => files.filter((f) => unstagedPaths.has(normalizePath(f.path))),
    [files, unstagedPaths]
  );

  const scopedComments = useMemo(() => {
    let filtered = diffComments.filter((c) => c.diffScope === scope);
    if (deferredSelectedFile) {
      filtered = filtered.filter((c) => c.filePath === deferredSelectedFile);
    }
    return filtered;
  }, [diffComments, scope, deferredSelectedFile]);

  if (!activeTaskId) return <EmptyState message="Select a task to see changes" />;
  if (!updatedAt) return <EmptyState message="Code changes will appear here" />;
  if (!diff) {
    const msg = getEmptyMessage(scope, activeTab, deferredDiffState);
    return <EmptyState message={msg ?? 'No changes'} />;
  }

  return (
    <div className="relative flex flex-1 min-h-0">
      {isStale && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
          <div className="w-4 h-4 border-2 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      )}
      {isFileTreeOpen && visibleFiles.length > 0 && (
        <DiffFileTree
          selectedFile={deferredSelectedFile}
          onSelectFile={onSelectFile}
          width={fileTreeWidth}
          {...(scope === 'working-tree'
            ? { groupMode: 'staged-unstaged' as const, stagedFiles, unstagedFiles }
            : { groupMode: 'flat' as const, files: visibleFiles })}
        />
      )}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <DiffContent
          rawDiff={diff}
          wordWrap={wordWrap}
          viewType={viewType}
          scope={scope}
          panelWidth={panelWidth}
          selectedFile={deferredSelectedFile}
          diffComments={scopedComments}
          onAddComment={onAddComment}
          onResolveComment={onResolveComment}
          onDeleteComment={onDeleteComment}
          showResolvedComments={showResolvedComments}
        />
      </div>
    </div>
  );
}

interface DiffPanelContentProps {
  activeTaskId: string | null;
}

export function DiffPanelContent({ activeTaskId }: DiffPanelContentProps) {
  const activeTab: DiffTab = 'unstaged';
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  const diffPanelWidth = useUIStore((s) => s.diffPanelWidth);
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

  const { diffState, diffComments, addDiffComment, resolveDiffComment, deleteDiffComment } =
    useTaskDocument(activeTaskId);

  const showResolvedComments = useUIStore((s) => s.showResolvedComments);
  const toggleResolvedComments = useUIStore((s) => s.toggleResolvedComments);

  const handleAddComment = useCallback(
    (
      filePath: string,
      lineNumber: number,
      side: DiffCommentSide,
      lineContentHash: string,
      body: string
    ) => {
      addDiffComment({
        filePath,
        lineNumber,
        side,
        diffScope: diffScope === 'branch' ? 'working-tree' : diffScope,
        lineContentHash,
        body,
        authorId: 'local-user',
      });
    },
    [addDiffComment, diffScope]
  );

  useEffect(() => {
    setSelectedFile(null);
  }, [diffScope, activeTab, activeTaskId]);

  const unresolvedCommentCount = useMemo(
    () => diffComments.filter((c) => c.resolvedAt === null).length,
    [diffComments]
  );

  const fileCount = useMemo(() => {
    if (!diffState) return 0;
    switch (diffScope) {
      case 'working-tree':
        return diffState.files.length;
      case 'branch':
        return diffState.branchFiles.length;
      case 'last-turn':
        return diffState.lastTurnFiles.length;
      default:
        return assertNever(diffScope);
    }
  }, [diffState, diffScope]);

  const toolbarContent: ReactNode = useMemo(
    () => (
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
    ),
    [diffScope, setDiffScope]
  );

  const activeSidePanel = useUIStore((s) => s.activeSidePanel);
  useSidePanelToolbarSlot(activeSidePanel === 'diff' ? toolbarContent : null);

  return (
    <div className="flex flex-col h-full min-w-0 sm:min-w-[400px]">
      <DiffActionBar
        fileCount={fileCount}
        isFileTreeOpen={isDiffFileTreeOpen && !isMobile}
        onToggleFileTree={toggleDiffFileTree}
        diffViewType={diffViewType}
        setDiffViewType={setDiffViewType}
        diffWordWrap={diffWordWrap}
        setDiffWordWrap={setDiffWordWrap}
        showResolvedComments={showResolvedComments}
        toggleResolvedComments={toggleResolvedComments}
        unresolvedCommentCount={unresolvedCommentCount}
      />
      <div
        ref={contentRef}
        role="region"
        aria-label="Diff content"
        className="flex flex-col flex-1 min-h-0"
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
          diffComments={diffComments}
          onAddComment={handleAddComment}
          onResolveComment={resolveDiffComment}
          onDeleteComment={deleteDiffComment}
          showResolvedComments={showResolvedComments}
        />
      </div>
    </div>
  );
}
