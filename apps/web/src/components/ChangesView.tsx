import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Alert, Button, ButtonGroup, Card, Chip, Link as HeroLink } from '@heroui/react';
import { type LinkedPR, type PlanMetadata, updateLinkedPRStatus } from '@peer-plan/schema';
import {
  Columns2,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Rocket,
  Rows3,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useLinkedPRs } from '@/hooks/useLinkedPRs';
import { usePRReviewComments } from '@/hooks/usePRReviewComments';

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
  viewMode: DiffViewMode;
}

function FileDiffView({ filename, patch, viewMode }: FileDiffViewProps) {
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
      <Card.Header>
        <Card.Title className="font-mono text-sm">{filename}</Card.Title>
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
        />
      </Card.Content>
    </Card>
  );
}
