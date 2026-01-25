/**
 * Shared FileDiffView component for displaying file diffs.
 * Used by both ChangesView (PR diffs with comments) and LocalChangesViewer (local git changes).
 */
import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view-pure.css';
import { Alert, Button, ButtonGroup, Card } from '@heroui/react';
import type { DiffComment } from '@shipyard/schema';
import { ChevronRight, Columns2, Rows3 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { AddDiffCommentForm } from './AddDiffCommentForm';
import { DiffCommentThread } from './DiffCommentThread';

// --- Types ---

export type DiffViewMode = 'unified' | 'split';

// --- Helper Functions ---

/**
 * Parse a unified diff patch to extract line content at each line number.
 * Used for line content hashing and staleness detection.
 */
function parsePatchToLineContentMap(patch: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = patch.split('\n');
  let newLineNumber = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNumber = Number.parseInt(hunkMatch[1] ?? '1', 10);
      continue;
    }

    if (newLineNumber === 0) continue;

    const isAddition = line.startsWith('+') && !line.startsWith('+++');
    const isDeletion = line.startsWith('-') && !line.startsWith('---');
    const isNoNewline = line.startsWith('\\');

    if (isAddition) {
      map.set(newLineNumber, line.slice(1));
      newLineNumber++;
    } else if (!isDeletion && !isNoNewline) {
      map.set(newLineNumber, line.slice(1));
      newLineNumber++;
    }
  }
  return map;
}

/**
 * Comment support configuration for diff viewing.
 * Supports both PR review comments and local diff comments.
 */
export interface CommentSupport {
  /** Type of comments: 'pr' for PR review, 'local' for uncommitted changes */
  type: 'pr' | 'local';
  /** PR number (required for PR comments) */
  prNumber?: number;
  /** Comments to display */
  comments: DiffComment[];
  /** Y.Doc for CRDT operations */
  ydoc: Y.Doc;
  /** Current user's GitHub username */
  currentUser?: string;
  /** Current HEAD SHA (for staleness detection on local comments) */
  currentHeadSha?: string;
  /** Map of line number to line content (for content hash staleness detection) */
  lineContentMap?: Map<number, string>;
}

export interface FileDiffViewProps {
  filename: string;
  patch?: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  /** Optional comment support for PR or local diffs */
  commentSupport?: CommentSupport;
  /** Whether sidebar is collapsed (shows expand button in header) */
  sidebarCollapsed?: boolean;
  /** Callback to expand sidebar */
  onExpandSidebar?: () => void;
}

/**
 * Custom comparison for React.memo that handles commentSupport deeply.
 * This prevents re-renders when the commentSupport object reference changes
 * but the meaningful content hasn't changed.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Prop comparison requires many conditional checks
function arePropsEqual(prev: FileDiffViewProps, next: FileDiffViewProps): boolean {
  // Quick reference check
  if (prev === next) return true;

  // Compare primitive props
  if (prev.filename !== next.filename) return false;
  if (prev.patch !== next.patch) return false;
  if (prev.viewMode !== next.viewMode) return false;
  if (prev.sidebarCollapsed !== next.sidebarCollapsed) return false;

  // Function props - compare by reference (they should be memoized by parent)
  if (prev.onViewModeChange !== next.onViewModeChange) return false;
  if (prev.onExpandSidebar !== next.onExpandSidebar) return false;

  // Deep compare commentSupport
  const prevCS = prev.commentSupport;
  const nextCS = next.commentSupport;

  // Both undefined
  if (!prevCS && !nextCS) return true;
  // One undefined
  if (!prevCS || !nextCS) return false;

  // Compare commentSupport properties
  if (prevCS.type !== nextCS.type) return false;
  if (prevCS.prNumber !== nextCS.prNumber) return false;
  if (prevCS.ydoc !== nextCS.ydoc) return false;
  if (prevCS.currentUser !== nextCS.currentUser) return false;
  if (prevCS.currentHeadSha !== nextCS.currentHeadSha) return false;

  // For comments array, compare length and IDs (not full deep equality)
  // This allows re-render only when comments are actually added/removed
  const prevComments = prevCS.comments;
  const nextComments = nextCS.comments;
  if (prevComments.length !== nextComments.length) return false;

  // Compare comment IDs to detect actual changes
  for (let i = 0; i < prevComments.length; i++) {
    if (prevComments[i]?.id !== nextComments[i]?.id) return false;
  }

  return true;
}

/**
 * FileDiffView component - wrapped with React.memo to prevent unnecessary re-renders.
 *
 * CRITICAL: The DiffView library closes widgets when it re-renders. To prevent the
 * comment form from closing unexpectedly, we need to:
 * 1. Use React.memo with custom comparison to prevent re-renders when props haven't meaningfully changed
 * 2. Use refs for callbacks to maintain stable function references
 * 3. Only update extendData when comments actually change (not just array reference)
 */
export const FileDiffView = memo(function FileDiffView({
  filename,
  patch,
  viewMode,
  onViewModeChange,
  commentSupport,
  sidebarCollapsed,
  onExpandSidebar,
}: FileDiffViewProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Detect theme from document
  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };
    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Extract stable references from commentSupport to minimize re-renders
  const comments = commentSupport?.comments;
  const ydoc = commentSupport?.ydoc;
  const commentType = commentSupport?.type;
  const prNumber = commentSupport?.prNumber;
  const currentUser = commentSupport?.currentUser;
  const currentHeadSha = commentSupport?.currentHeadSha;

  // Parse patch to build a map of line number -> line content for staleness detection
  const lineContentMap = useMemo(() => {
    if (!patch) return new Map<number, string>();
    return parsePatchToLineContentMap(patch);
  }, [patch]);

  // Store callback dependencies in refs so callbacks can access latest values
  // without changing their reference (which would cause DiffView to close widgets)
  const callbackDepsRef = useRef({
    ydoc,
    commentType,
    prNumber,
    currentHeadSha,
    currentUser,
    filename,
    lineContentMap,
  });
  // Update ref on every render (this doesn't cause re-renders)
  callbackDepsRef.current = {
    ydoc,
    commentType,
    prNumber,
    currentHeadSha,
    currentUser,
    filename,
    lineContentMap,
  };

  // Build extendData from comments grouped by line number (only when commentSupport provided)
  const extendData = useMemo(() => {
    if (!comments) return undefined;

    const fileComments = comments.filter((c) => c.path === filename);
    const newFile: Record<string, { data: DiffComment[] }> = {};

    for (const comment of fileComments) {
      const key = String(comment.line);
      const existing = newFile[key];
      if (existing) {
        existing.data.push(comment);
      } else {
        newFile[key] = { data: [comment] };
      }
    }

    // Sort comments within each line by creation time
    for (const entry of Object.values(newFile)) {
      entry.data.sort((a, b) => a.createdAt - b.createdAt);
    }

    return { newFile };
  }, [comments, filename]);

  // CRITICAL: Use a stable callback that reads from ref to prevent DiffView re-renders
  // This callback reference NEVER changes, so DiffView won't close the widget
  const renderExtendLine = useCallback(({ data }: { data: unknown }) => {
    const {
      ydoc: doc,
      currentUser: user,
      currentHeadSha: sha,
      lineContentMap: contentMap,
    } = callbackDepsRef.current;
    if (!doc) return null;
    return (
      <DiffCommentThread
        comments={data as DiffComment[]}
        ydoc={doc}
        currentUser={user}
        currentHeadSha={sha}
        lineContentMap={contentMap}
      />
    );
  }, []); // Empty deps - callback is stable forever, reads from ref

  // CRITICAL: Use a stable callback that reads from ref to prevent DiffView re-renders
  // This callback reference NEVER changes, so DiffView won't close the widget
  const renderWidgetLine = useCallback(
    ({ lineNumber, onClose }: { lineNumber: number; onClose: () => void }) => {
      const {
        ydoc: doc,
        commentType: type,
        prNumber: pr,
        currentHeadSha: sha,
        filename: path,
        lineContentMap: contentMap,
      } = callbackDepsRef.current;
      if (!doc || !type) return null;
      return (
        <AddDiffCommentForm
          commentType={type}
          prNumber={pr}
          currentHeadSha={sha}
          path={path}
          line={lineNumber}
          lineContent={contentMap.get(lineNumber)}
          ydoc={doc}
          onClose={onClose}
        />
      );
    },
    []
  ); // Empty deps - callback is stable forever, reads from ref

  if (!patch) {
    return (
      <Alert status="warning">
        <Alert.Content>
          <Alert.Title>No Diff Available</Alert.Title>
          <Alert.Description>
            The diff for <code>{filename}</code> is not available (may be a binary file).
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  // Detect file language from extension for syntax highlighting
  const fileLang = filename.split('.').pop() || 'text';

  // Construct a proper unified diff string from GitHub's patch
  // GitHub API returns just the hunk content, but the library needs full diff format
  const fullDiff = `diff --git a/${filename} b/${filename}
--- a/${filename}
+++ b/${filename}
${patch}`;

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {sidebarCollapsed && onExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              className="p-1 hover:bg-surface-hover rounded transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <Card.Title className="font-mono text-sm">{filename}</Card.Title>
        </div>
        <ButtonGroup size="sm" variant="tertiary">
          <Button
            isIconOnly
            aria-label="Unified view"
            onPress={() => onViewModeChange('unified')}
            className={viewMode === 'unified' ? 'bg-primary/10 text-primary' : ''}
          >
            <Rows3 className="w-4 h-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="Split view"
            onPress={() => onViewModeChange('split')}
            className={viewMode === 'split' ? 'bg-primary/10 text-primary' : ''}
          >
            <Columns2 className="w-4 h-4" />
          </Button>
        </ButtonGroup>
      </Card.Header>
      <Card.Content className="p-0">
        <DiffView
          data={{
            oldFile: { fileName: filename, fileLang },
            newFile: { fileName: filename, fileLang },
            hunks: [fullDiff],
          }}
          diffViewMode={viewMode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified}
          diffViewTheme={theme}
          diffViewHighlight={true}
          diffViewWrap={true}
          // Comment support props - using memoized callbacks to prevent widget from closing
          // CRITICAL: renderWidgetLine and renderExtendLine must be stable references
          // or the DiffView library will close the widget on every parent re-render
          diffViewAddWidget={!!commentSupport}
          extendData={extendData}
          renderExtendLine={commentSupport ? renderExtendLine : undefined}
          renderWidgetLine={commentSupport ? renderWidgetLine : undefined}
        />
      </Card.Content>
    </Card>
  );
}, arePropsEqual);
