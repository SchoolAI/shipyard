import {
  Alert,
  Avatar,
  Button,
  ButtonGroup,
  Card,
  Chip,
  Link as HeroLink,
  TextArea,
} from '@heroui/react';
import {
  addPRReviewComment,
  type LinkedPR,
  type PlanMetadata,
  type PRReviewComment,
  removePRReviewComment,
  resolvePRReviewComment,
  updateLinkedPRStatus,
} from '@peer-plan/schema';
import {
  Check,
  CheckCircle,
  Columns2,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Plus,
  Rocket,
  RotateCcw,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useLinkedPRs } from '@/hooks/useLinkedPRs';
import { getCommentsForFile, usePRReviewComments } from '@/hooks/usePRReviewComments';

// --- Types ---

type DiffViewMode = 'unified' | 'split';

// --- LocalStorage Helpers ---

const DIFF_VIEW_MODE_KEY = 'peer-plan:diff-view-mode';

function getDiffViewModePreference(): DiffViewMode {
  try {
    const stored = localStorage.getItem(DIFF_VIEW_MODE_KEY);
    return stored === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

function setDiffViewModePreference(mode: DiffViewMode): void {
  try {
    localStorage.setItem(DIFF_VIEW_MODE_KEY, mode);
  } catch {
    // Ignore localStorage errors
  }
}

interface ChangesViewProps {
  ydoc: Y.Doc;
  metadata: PlanMetadata;
}

export function ChangesView({ ydoc, metadata }: ChangesViewProps) {
  const linkedPRs = useLinkedPRs(ydoc);
  const [selectedPR, setSelectedPR] = useState<number | null>(null);

  // Auto-select first PR when available
  useEffect(() => {
    if (linkedPRs.length > 0 && selectedPR === null) {
      const firstPR = linkedPRs[0];
      if (firstPR) {
        setSelectedPR(firstPR.prNumber);
      }
    }
  }, [linkedPRs, selectedPR]);

  // Empty state
  if (linkedPRs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <Card>
          <Card.Content className="p-6 text-center">
            <GitPullRequest className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No PRs Linked</h3>
            <p className="text-foreground/80 mb-4">
              PRs are auto-linked when you run{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">complete_task</code>.
            </p>
            <p className="text-sm text-muted-foreground">
              Create a PR first, then complete the task to see changes here.
            </p>
          </Card.Content>
        </Card>
      </div>
    );
  }

  const selected = linkedPRs.find((pr) => pr.prNumber === selectedPR) ?? linkedPRs[0] ?? null;

  return (
    <div className="max-w-full mx-auto p-2 md:p-4 space-y-2">
      {/* PR List (when multiple PRs) */}
      {linkedPRs.length > 1 && (
        <div className="space-y-1.5">
          {linkedPRs.map((pr) => (
            <PRCard
              key={pr.prNumber}
              pr={pr}
              selected={pr.prNumber === selectedPR}
              onSelect={() => setSelectedPR(pr.prNumber)}
            />
          ))}
        </div>
      )}

      {/* Selected PR diff viewer */}
      {selected && (
        <div className="space-y-2">
          {/* PR Header (compact) */}
          <PRHeader pr={selected} repo={metadata.repo} planId={metadata.id} ydoc={ydoc} />

          {/* Diff Viewer with Comments */}
          <DiffViewer pr={selected} repo={metadata.repo || ''} ydoc={ydoc} />
        </div>
      )}
    </div>
  );
}

// --- Subcomponents ---

interface PRCardProps {
  pr: LinkedPR;
  selected: boolean;
  onSelect: () => void;
}

function PRCard({ pr, selected, onSelect }: PRCardProps) {
  // Map PR status to HeroUI Chip color
  const statusColor: 'default' | 'success' | 'accent' | 'danger' =
    pr.status === 'draft'
      ? 'default'
      : pr.status === 'open'
        ? 'success'
        : pr.status === 'merged'
          ? 'accent'
          : 'danger';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-separator hover:border-primary/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <GitPullRequest className="w-4 h-4" />
        <span className="font-medium">#{pr.prNumber}</span>
        <Chip size="sm" color={statusColor}>
          {pr.status}
        </Chip>
      </div>
      {pr.title && <div className="text-sm text-muted-foreground mt-1 truncate">{pr.title}</div>}
      {pr.branch && (
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          {pr.branch}
        </div>
      )}
    </button>
  );
}

interface PRHeaderProps {
  pr: LinkedPR;
  repo?: string;
  planId: string;
  ydoc: Y.Doc;
}

function PRHeader({ pr, repo, planId, ydoc }: PRHeaderProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublish = useCallback(async () => {
    if (!repo) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      // Call the registry server to publish the PR
      const res = await fetch(
        `http://localhost:32191/api/plan/${planId}/pr/${pr.prNumber}/publish`,
        {
          method: 'POST',
        }
      ).catch(() =>
        // Try alternate port
        fetch(`http://localhost:32192/api/plan/${planId}/pr/${pr.prNumber}/publish`, {
          method: 'POST',
        })
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      // Update status in Y.Doc
      updateLinkedPRStatus(ydoc, pr.prNumber, 'open');
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Failed to publish PR');
    } finally {
      setIsPublishing(false);
    }
  }, [repo, planId, pr.prNumber, ydoc]);

  const isDraft = pr.status === 'draft';

  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1.5 bg-surface rounded-lg border border-separator">
      {/* Left: PR info (compact) */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <GitPullRequest className="w-4 h-4 text-primary shrink-0" />
        <span className="font-medium text-sm">#{pr.prNumber}</span>
        <Chip
          size="sm"
          color={
            pr.status === 'draft'
              ? 'default'
              : pr.status === 'merged'
                ? 'accent'
                : pr.status === 'open'
                  ? 'success'
                  : 'danger'
          }
        >
          {pr.status}
        </Chip>
        {pr.title && (
          <span className="text-sm text-foreground/80 truncate hidden sm:inline">{pr.title}</span>
        )}
        {pr.branch && (
          <code className="text-xs text-muted-foreground hidden md:inline">
            <GitBranch className="w-3 h-3 inline mr-0.5" />
            {pr.branch}
          </code>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {publishError && (
          <span className="text-xs text-danger hidden sm:inline">{publishError}</span>
        )}
        {isDraft && repo && (
          <Button
            size="sm"
            variant="primary"
            onPress={handlePublish}
            isDisabled={isPublishing}
            isPending={isPublishing}
          >
            <Rocket className="w-3.5 h-3.5" />
            Publish
          </Button>
        )}
        {repo && (
          <HeroLink
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </HeroLink>
        )}
      </div>
    </div>
  );
}

interface DiffViewerProps {
  pr: LinkedPR;
  repo: string;
  ydoc: Y.Doc;
}

function DiffViewer({ pr, repo, ydoc }: DiffViewerProps) {
  const [files, setFiles] = useState<PRFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getDiffViewModePreference);
  const { identity } = useGitHubAuth();

  // Get all comments for this PR
  const comments = usePRReviewComments(ydoc, pr.prNumber);

  // Handle view mode change with localStorage persistence
  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
    setDiffViewModePreference(mode);
  }, []);

  // Count comments per file
  const commentCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) {
      const current = counts.get(comment.path) ?? 0;
      counts.set(comment.path, current + 1);
    }
    return counts;
  }, [comments]);

  // Fetch file list directly from GitHub API
  useEffect(() => {
    if (!repo) return;

    setLoading(true);
    setError(null);

    // Build headers with optional auth for private repos
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
    };
    if (identity?.token) {
      headers.Authorization = `Bearer ${identity.token}`;
    }

    // Fetch directly from GitHub API
    fetch(`https://api.github.com/repos/${repo}/pulls/${pr.prNumber}/files`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json();
      })
      .then(
        (
          data: Array<{
            filename: string;
            status: string;
            additions: number;
            deletions: number;
            changes: number;
            patch?: string;
          }>
        ) => {
          setFiles(
            data.map((file) => ({
              filename: file.filename,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
              changes: file.changes,
              patch: file.patch,
            }))
          );
          setLoading(false);
        }
      )
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [pr.prNumber, repo, identity?.token]);

  // Auto-select first file when files load
  useEffect(() => {
    if (files.length > 0 && selectedFile === null) {
      const firstFile = files[0];
      if (firstFile) {
        setSelectedFile(firstFile.filename);
      }
    }
  }, [files, selectedFile]);

  if (loading) {
    return (
      <Card>
        <Card.Content className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">Loading PR files...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>Failed to Load PR Files</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (files.length === 0) {
    return (
      <Alert status="default">
        <Alert.Content>
          <Alert.Title>No Files Changed</Alert.Title>
          <Alert.Description>This PR has no file changes.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {/* Toolbar: File selector + View toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* File selector (compact horizontal scroll) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">
            {files.length} file{files.length !== 1 ? 's' : ''}:
          </span>
          {files.map((file) => (
            <FileChip
              key={file.filename}
              file={file}
              selected={file.filename === selectedFile}
              onSelect={() => setSelectedFile(file.filename)}
              commentCount={commentCountByFile.get(file.filename) ?? 0}
            />
          ))}
        </div>

        {/* View mode toggle */}
        <ButtonGroup size="sm" variant="tertiary">
          <Button
            isIconOnly
            aria-label="Unified view"
            onPress={() => handleViewModeChange('unified')}
            className={viewMode === 'unified' ? 'bg-primary/10 text-primary' : ''}
          >
            <Rows3 className="w-4 h-4" />
          </Button>
          <Button
            isIconOnly
            aria-label="Split view"
            onPress={() => handleViewModeChange('split')}
            className={viewMode === 'split' ? 'bg-primary/10 text-primary' : ''}
          >
            <Columns2 className="w-4 h-4" />
          </Button>
        </ButtonGroup>
      </div>

      {/* Diff View for Selected File */}
      {selectedFile && (
        <FileDiffView
          filename={selectedFile}
          patch={files.find((f) => f.filename === selectedFile)?.patch}
          prNumber={pr.prNumber}
          ydoc={ydoc}
          comments={getCommentsForFile(comments, selectedFile)}
          viewMode={viewMode}
        />
      )}
    </div>
  );
}

// --- Helper Components ---

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface FileChipProps {
  file: PRFile;
  selected: boolean;
  onSelect: () => void;
  commentCount: number;
}

/** Compact chip-style file selector for horizontal scrolling */
function FileChip({ file, selected, onSelect, commentCount }: FileChipProps) {
  // Extract just the filename from the path for display
  const displayName = file.filename.split('/').pop() ?? file.filename;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono whitespace-nowrap transition-colors shrink-0 ${
        selected
          ? 'bg-primary text-white'
          : 'bg-surface border border-separator hover:border-primary/50'
      }`}
      title={file.filename}
    >
      <span className="truncate max-w-[150px]">{displayName}</span>
      {commentCount > 0 && (
        <span
          className={`flex items-center gap-0.5 ${selected ? 'text-white/80' : 'text-primary'}`}
        >
          <MessageSquare className="w-3 h-3" />
          {commentCount}
        </span>
      )}
      <span className={selected ? 'text-white/80' : 'text-success'}>+{file.additions}</span>
      <span className={selected ? 'text-white/80' : 'text-danger'}>-{file.deletions}</span>
    </button>
  );
}

interface FileDiffViewProps {
  filename: string;
  patch?: string;
  prNumber: number;
  ydoc: Y.Doc;
  comments: PRReviewComment[];
  viewMode: DiffViewMode;
}

/** Parsed diff line with metadata for rendering comments */
interface DiffLine {
  content: string;
  type: 'add' | 'remove' | 'context' | 'hunk' | 'meta';
  /** Line number in the modified file (null for removed lines and meta lines) */
  newLineNumber: number | null;
  /** Line number in the original file (null for added lines and meta lines) */
  oldLineNumber: number | null;
  /** Index in the raw diff output */
  diffIndex: number;
}

/**
 * Parse a unified diff patch into structured lines with line number mapping.
 * Line numbers are extracted from @@ hunk headers and tracked for each line.
 */
function parseDiffPatch(patch: string): DiffLine[] {
  const rawLines = patch.split('\n');
  const result: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? '';

    // Meta lines (diff --git, index, ---, +++)
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      result.push({
        content: line,
        type: 'meta',
        newLineNumber: null,
        oldLineNumber: null,
        diffIndex: i,
      });
      continue;
    }

    // Hunk header @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1] ?? '1', 10);
      newLine = Number.parseInt(hunkMatch[2] ?? '1', 10);
      result.push({
        content: line,
        type: 'hunk',
        newLineNumber: null,
        oldLineNumber: null,
        diffIndex: i,
      });
      continue;
    }

    // Added line
    if (line.startsWith('+')) {
      result.push({
        content: line,
        type: 'add',
        newLineNumber: newLine,
        oldLineNumber: null,
        diffIndex: i,
      });
      newLine++;
      continue;
    }

    // Removed line
    if (line.startsWith('-')) {
      result.push({
        content: line,
        type: 'remove',
        newLineNumber: null,
        oldLineNumber: oldLine,
        diffIndex: i,
      });
      oldLine++;
      continue;
    }

    // Context line (starts with space or is empty)
    result.push({
      content: line,
      type: 'context',
      newLineNumber: newLine,
      oldLineNumber: oldLine,
      diffIndex: i,
    });
    oldLine++;
    newLine++;
  }

  return result;
}

/** Represents a paired row for split view (old side | new side) */
interface SplitDiffRow {
  /** Unique key for React rendering */
  key: string;
  oldLine: DiffLine | null;
  newLine: DiffLine | null;
  /** For hunk/meta lines that span both sides */
  spanBoth: DiffLine | null;
}

/**
 * Convert unified diff lines into paired rows for split view.
 * Pairs additions/removals that are adjacent, context lines appear on both sides.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Diff pairing logic inherently requires multiple conditions
function pairDiffLinesForSplit(lines: DiffLine[]): SplitDiffRow[] {
  const result: SplitDiffRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }

    // Hunk headers and meta lines span both sides
    if (line.type === 'hunk' || line.type === 'meta') {
      result.push({ key: `span-${line.diffIndex}`, oldLine: null, newLine: null, spanBoth: line });
      i++;
      continue;
    }

    // Context lines appear on both sides
    if (line.type === 'context') {
      result.push({ key: `ctx-${line.diffIndex}`, oldLine: line, newLine: line, spanBoth: null });
      i++;
      continue;
    }

    // Collect consecutive removals
    const removals: DiffLine[] = [];
    while (i < lines.length && lines[i]?.type === 'remove') {
      const removal = lines[i];
      if (removal) removals.push(removal);
      i++;
    }

    // Collect consecutive additions
    const additions: DiffLine[] = [];
    while (i < lines.length && lines[i]?.type === 'add') {
      const addition = lines[i];
      if (addition) additions.push(addition);
      i++;
    }

    // Pair them up using the first diffIndex of each group
    const maxLen = Math.max(removals.length, additions.length);
    const baseOldIdx = removals[0]?.diffIndex ?? 0;
    const baseNewIdx = additions[0]?.diffIndex ?? 0;
    for (let j = 0; j < maxLen; j++) {
      const oldLine = removals[j] ?? null;
      const newLine = additions[j] ?? null;
      // Create unique key from diff indices of both sides
      const keyPart = oldLine
        ? `o${oldLine.diffIndex}`
        : newLine
          ? `n${newLine.diffIndex}`
          : `p${baseOldIdx}-${baseNewIdx}-${j}`;
      result.push({
        key: `pair-${keyPart}`,
        oldLine,
        newLine,
        spanBoth: null,
      });
    }
  }

  return result;
}

function FileDiffView({ filename, patch, prNumber, ydoc, comments, viewMode }: FileDiffViewProps) {
  const { identity } = useGitHubAuth();
  const [commentingLine, setCommentingLine] = useState<number | null>(null);

  // Reset commenting state when file changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: filename is a prop that changes when user selects different file
  useEffect(() => {
    setCommentingLine(null);
  }, [filename]);

  // Group comments by line number for quick lookup
  const commentsByLine = useMemo(() => {
    const map = new Map<number, PRReviewComment[]>();
    for (const comment of comments) {
      const existing = map.get(comment.line);
      if (existing) {
        existing.push(comment);
      } else {
        map.set(comment.line, [comment]);
      }
    }
    return map;
  }, [comments]);

  const handleAddComment = useCallback(
    (line: number, body: string) => {
      if (!identity) return;

      const comment: PRReviewComment = {
        id: crypto.randomUUID(),
        prNumber,
        path: filename,
        line,
        body,
        author: identity.username,
        createdAt: Date.now(),
        resolved: false,
      };

      addPRReviewComment(ydoc, comment);
      setCommentingLine(null);
    },
    [ydoc, prNumber, filename, identity]
  );

  const handleResolveComment = useCallback(
    (commentId: string, resolved: boolean) => {
      resolvePRReviewComment(ydoc, commentId, resolved);
    },
    [ydoc]
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      removePRReviewComment(ydoc, commentId);
    },
    [ydoc]
  );

  if (!patch) {
    return (
      <Alert status="warning">
        <Alert.Content>
          <Alert.Title>No Diff Available</Alert.Title>
          <Alert.Description>
            The patch for <code>{filename}</code> is not available.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const diffLines = parseDiffPatch(patch);
  const splitRows = viewMode === 'split' ? pairDiffLinesForSplit(diffLines) : [];

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between py-2">
        <Card.Title className="font-mono text-sm">{filename}</Card.Title>
        {comments.length > 0 && (
          <Chip size="sm" color="default">
            <MessageSquare className="w-3 h-3 mr-1" />
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </Chip>
        )}
      </Card.Header>
      <Card.Content className="p-0">
        <div className="bg-muted rounded-b-lg overflow-x-auto max-h-[600px] overflow-y-auto">
          {viewMode === 'unified' ? (
            <table className="w-full text-sm font-mono border-collapse">
              <tbody>
                {diffLines.map((line) => {
                  const lineComments =
                    line.newLineNumber !== null
                      ? (commentsByLine.get(line.newLineNumber) ?? [])
                      : [];
                  const isCommenting =
                    commentingLine !== null && commentingLine === line.newLineNumber;
                  const canComment = line.type === 'add' || line.type === 'context';

                  return (
                    <DiffLineRow
                      key={line.diffIndex}
                      line={line}
                      comments={lineComments}
                      isCommenting={isCommenting}
                      canComment={canComment}
                      hasIdentity={!!identity}
                      onStartComment={() => setCommentingLine(line.newLineNumber)}
                      onCancelComment={() => setCommentingLine(null)}
                      onAddComment={(body) =>
                        line.newLineNumber !== null && handleAddComment(line.newLineNumber, body)
                      }
                      onResolveComment={handleResolveComment}
                      onDeleteComment={handleDeleteComment}
                      currentUser={identity?.username}
                    />
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm font-mono border-collapse table-fixed">
              <tbody>
                {splitRows.map((row) => {
                  // Spanning row (hunk header or meta)
                  if (row.spanBoth) {
                    return <SplitDiffSpanRow key={row.key} line={row.spanBoth} />;
                  }

                  const newLineNum = row.newLine?.newLineNumber ?? null;
                  const lineComments =
                    newLineNum !== null ? (commentsByLine.get(newLineNum) ?? []) : [];
                  const isCommenting = commentingLine !== null && commentingLine === newLineNum;
                  const canComment = row.newLine?.type === 'add' || row.newLine?.type === 'context';

                  return (
                    <SplitDiffRow
                      key={row.key}
                      oldLine={row.oldLine}
                      newLine={row.newLine}
                      comments={lineComments}
                      isCommenting={isCommenting}
                      canComment={canComment}
                      hasIdentity={!!identity}
                      onStartComment={() => setCommentingLine(newLineNum)}
                      onCancelComment={() => setCommentingLine(null)}
                      onAddComment={(body) =>
                        newLineNum !== null && handleAddComment(newLineNum, body)
                      }
                      onResolveComment={handleResolveComment}
                      onDeleteComment={handleDeleteComment}
                      currentUser={identity?.username}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

interface DiffLineRowProps {
  line: DiffLine;
  comments: PRReviewComment[];
  isCommenting: boolean;
  canComment: boolean;
  hasIdentity: boolean;
  onStartComment: () => void;
  onCancelComment: () => void;
  onAddComment: (body: string) => void;
  onResolveComment: (id: string, resolved: boolean) => void;
  onDeleteComment: (id: string) => void;
  currentUser?: string;
}

function DiffLineRow({
  line,
  comments,
  isCommenting,
  canComment,
  hasIdentity,
  onStartComment,
  onCancelComment,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  currentUser,
}: DiffLineRowProps) {
  const bgClass = {
    add: 'bg-success/10',
    remove: 'bg-danger/10',
    context: '',
    hunk: 'bg-accent/5',
    meta: 'bg-muted/30',
  }[line.type];

  const textClass = {
    add: 'text-success',
    remove: 'text-danger',
    context: 'text-foreground',
    hunk: 'text-accent font-semibold',
    meta: 'text-muted',
  }[line.type];

  const hasComments = comments.length > 0;
  const unresolvedCount = comments.filter((c) => !c.resolved).length;

  return (
    <>
      {/* Main diff line */}
      <tr className={`${bgClass} group hover:bg-muted/30`}>
        {/* Comment indicator gutter */}
        <td className="w-8 text-center align-middle border-r border-separator/30">
          {hasComments ? (
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                unresolvedCount > 0 ? 'bg-primary text-white' : 'bg-success/20 text-success'
              }`}
              title={`${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
            >
              {unresolvedCount > 0 ? unresolvedCount : <Check className="w-3 h-3" />}
            </span>
          ) : canComment && hasIdentity ? (
            <button
              type="button"
              onClick={onStartComment}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-primary/20"
              title="Add comment"
            >
              <Plus className="w-3 h-3 text-primary" />
            </button>
          ) : null}
        </td>

        {/* Old line number */}
        <td className="w-12 text-right pr-2 text-muted-foreground/60 select-none border-r border-separator/30">
          {line.oldLineNumber ?? ''}
        </td>

        {/* New line number */}
        <td className="w-12 text-right pr-2 text-muted-foreground/60 select-none border-r border-separator/30">
          {line.newLineNumber ?? ''}
        </td>

        {/* Line content */}
        <td className={`pl-2 pr-4 whitespace-pre ${textClass}`}>{line.content}</td>
      </tr>

      {/* Existing comments */}
      {hasComments && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="border-l-4 border-primary ml-4 my-1">
              {comments.map((comment) => (
                <InlineComment
                  key={comment.id}
                  comment={comment}
                  onResolve={(resolved) => onResolveComment(comment.id, resolved)}
                  onDelete={() => onDeleteComment(comment.id)}
                  canDelete={currentUser === comment.author}
                />
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Comment input */}
      {isCommenting && (
        <tr>
          <td colSpan={4} className="p-0">
            <CommentInput onSubmit={onAddComment} onCancel={onCancelComment} />
          </td>
        </tr>
      )}
    </>
  );
}

interface InlineCommentProps {
  comment: PRReviewComment;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  canDelete: boolean;
}

function InlineComment({ comment, onResolve, onDelete, canDelete }: InlineCommentProps) {
  const isAI = comment.author === 'AI';
  const timeAgo = formatTimeAgo(comment.createdAt);

  return (
    <div
      className={`p-3 bg-surface border-b border-separator/30 ${
        comment.resolved ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Author avatar */}
        <Avatar size="sm" color={isAI ? 'accent' : 'default'}>
          <Avatar.Fallback className="text-xs">
            {isAI ? 'AI' : comment.author.slice(0, 2).toUpperCase()}
          </Avatar.Fallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{isAI ? 'AI Review' : `@${comment.author}`}</span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
            {comment.resolved && (
              <Chip size="sm" color="success">
                <CheckCircle className="w-3 h-3 mr-1" />
                Resolved
              </Chip>
            )}
          </div>

          {/* Body */}
          <p className="text-sm text-foreground whitespace-pre-wrap">{comment.body}</p>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            {comment.resolved ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() => onResolve(false)}
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Unresolve
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onPress={() => onResolve(true)} className="text-xs">
                <Check className="w-3 h-3 mr-1" />
                Resolve
              </Button>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onPress={onDelete}
                className="text-xs text-danger hover:text-danger"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CommentInputProps {
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

function CommentInput({ onSubmit, onCancel }: CommentInputProps) {
  const [body, setBody] = useState('');

  const handleSubmit = () => {
    if (body.trim()) {
      onSubmit(body.trim());
      setBody('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter to submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="p-3 bg-surface border-l-4 border-primary ml-4 my-1">
      <TextArea
        aria-label="Comment"
        placeholder="Add a review comment... (Cmd+Enter to submit)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full mb-2"
        rows={3}
        autoFocus
      />
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="ghost" onPress={onCancel}>
          <X className="w-3 h-3 mr-1" />
          Cancel
        </Button>
        <Button size="sm" onPress={handleSubmit} isDisabled={!body.trim()}>
          <MessageSquare className="w-3 h-3 mr-1" />
          Comment
        </Button>
      </div>
    </div>
  );
}

// --- Split View Components ---

interface SplitDiffSpanRowProps {
  line: DiffLine;
}

/** Row that spans both columns for hunk headers and meta lines */
function SplitDiffSpanRow({ line }: SplitDiffSpanRowProps) {
  const bgClass = line.type === 'hunk' ? 'bg-accent/5' : 'bg-muted/30';
  const textClass = line.type === 'hunk' ? 'text-accent font-semibold' : 'text-muted';

  return (
    <tr className={bgClass}>
      <td colSpan={4} className={`px-2 py-0.5 text-center whitespace-pre ${textClass}`}>
        {line.content}
      </td>
    </tr>
  );
}

interface SplitDiffRowComponentProps {
  oldLine: DiffLine | null;
  newLine: DiffLine | null;
  comments: PRReviewComment[];
  isCommenting: boolean;
  canComment: boolean;
  hasIdentity: boolean;
  onStartComment: () => void;
  onCancelComment: () => void;
  onAddComment: (body: string) => void;
  onResolveComment: (id: string, resolved: boolean) => void;
  onDeleteComment: (id: string) => void;
  currentUser?: string;
}

/** Side-by-side diff row: old content on left, new content on right */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI component with conditional rendering for comments
function SplitDiffRow({
  oldLine,
  newLine,
  comments,
  isCommenting,
  canComment,
  hasIdentity,
  onStartComment,
  onCancelComment,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  currentUser,
}: SplitDiffRowComponentProps) {
  const hasComments = comments.length > 0;
  const unresolvedCount = comments.filter((c) => !c.resolved).length;

  // Background classes for each side
  const oldBgClass = oldLine?.type === 'remove' ? 'bg-danger/10' : '';
  const newBgClass = newLine?.type === 'add' ? 'bg-success/10' : '';

  // Text classes
  const oldTextClass = oldLine?.type === 'remove' ? 'text-danger' : 'text-foreground';
  const newTextClass = newLine?.type === 'add' ? 'text-success' : 'text-foreground';

  // Strip the leading +/- or space from content for cleaner display
  // Note: context lines start with space, add/remove lines start with +/-
  const oldContent =
    oldLine?.content.startsWith('-') || oldLine?.content.startsWith(' ')
      ? oldLine.content.slice(1)
      : (oldLine?.content ?? '');
  const newContent =
    newLine?.content.startsWith('+') || newLine?.content.startsWith(' ')
      ? newLine.content.slice(1)
      : (newLine?.content ?? '');

  return (
    <>
      <tr className="group hover:bg-muted/30">
        {/* Old side: line number + content */}
        <td
          className={`w-12 text-right pr-2 text-muted-foreground/60 select-none border-r border-separator/30 ${oldBgClass}`}
        >
          {oldLine?.oldLineNumber ?? ''}
        </td>
        <td className={`w-1/2 pl-2 pr-4 whitespace-pre ${oldBgClass} ${oldTextClass}`}>
          {oldContent}
        </td>

        {/* New side: line number + content + comment indicator */}
        <td
          className={`w-12 text-right pr-2 text-muted-foreground/60 select-none border-l border-r border-separator/30 ${newBgClass}`}
        >
          {newLine?.newLineNumber ?? ''}
        </td>
        <td className={`w-1/2 pl-2 pr-4 whitespace-pre relative ${newBgClass} ${newTextClass}`}>
          {newContent}
          {/* Comment indicator on the new side */}
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {hasComments ? (
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                  unresolvedCount > 0 ? 'bg-primary text-white' : 'bg-success/20 text-success'
                }`}
                title={`${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
              >
                {unresolvedCount > 0 ? unresolvedCount : <Check className="w-3 h-3" />}
              </span>
            ) : canComment && hasIdentity ? (
              <button
                type="button"
                onClick={onStartComment}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-primary/20"
                title="Add comment"
              >
                <Plus className="w-3 h-3 text-primary" />
              </button>
            ) : null}
          </span>
        </td>
      </tr>

      {/* Existing comments (spans full width) */}
      {hasComments && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="border-l-4 border-primary ml-4 my-1">
              {comments.map((comment) => (
                <InlineComment
                  key={comment.id}
                  comment={comment}
                  onResolve={(resolved) => onResolveComment(comment.id, resolved)}
                  onDelete={() => onDeleteComment(comment.id)}
                  canDelete={currentUser === comment.author}
                />
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Comment input */}
      {isCommenting && (
        <tr>
          <td colSpan={4} className="p-0">
            <CommentInput onSubmit={onAddComment} onCancel={onCancelComment} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago").
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
