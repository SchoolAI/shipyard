import { Alert, Card, Chip } from '@heroui/react';
import {
  type LinkedPR,
  type LocalChangesResult,
  type PlanMetadata,
  updateLinkedPRStatus,
} from '@shipyard/schema';
import {
  ChevronRight,
  FileText,
  Folder,
  GitBranch,
  GitPullRequest,
  MessageSquare,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeApi, type NodeRendererProps, Tree, type TreeApi } from 'react-arborist';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useLinkedPRs } from '@/hooks/useLinkedPRs';
import { useLocalChanges } from '@/hooks/useLocalChanges';
import { usePRReviewComments } from '@/hooks/usePRReviewComments';
import { assertNever } from '@/utils/assert-never';
import { type DiffViewMode, FileDiffView } from './diff';
import { LocalChangesViewer } from './LocalChangesViewer';

/** --- LocalStorage Helpers --- */

const DIFF_VIEW_MODE_KEY = 'shipyard:diff-view-mode';

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
    /** Ignore localStorage errors */
  }
}

/** Source of changes to display */
export type ChangeSource = 'local' | 'pr';

/** State exported to parent for rendering header controls */
export interface ChangesViewState {
  source: ChangeSource;
  setSource: (source: ChangeSource) => void;
  selectedPR: LinkedPR | null;
  hasPRs: boolean;
  localChanges: {
    data: LocalChangesResult | undefined;
    isFetching: boolean;
    refetch: () => void;
  };
  prChanges: {
    isFetching: boolean;
    refetch: () => void;
  };
}

interface ChangesViewProps {
  ydoc: Y.Doc;
  metadata: PlanMetadata;
  /** Whether this tab is currently active (triggers refetch) */
  isActive?: boolean;
  /** Callback to provide changes view state to parent (for rendering header controls) */
  onChangesViewState?: (state: ChangesViewState) => void;
}

export function ChangesView({
  ydoc,
  metadata,
  isActive = true,
  onChangesViewState,
}: ChangesViewProps) {
  const linkedPRs = useLinkedPRs(ydoc);
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const { identity } = useGitHubAuth();

  /** Determine default source: local if available, otherwise PR */
  const [source, setSource] = useState<ChangeSource>('local');

  /** Track PR fetching state and provide refetch trigger */
  const [prFetching, setPRFetching] = useState(false);
  const [prRefetchTrigger, setPRRefetchTrigger] = useState(0);

  /** Local changes hook - enabled when source is 'local' and tab is active */
  const {
    data: localChanges,
    isLoading: localLoading,
    isFetching: localFetching,
    refetch: refetchLocal,
  } = useLocalChanges(metadata.id, { enabled: source === 'local' && isActive });

  /** Refetch local changes when tab becomes active */
  useEffect(() => {
    if (isActive && source === 'local') {
      refetchLocal();
    }
  }, [isActive, source, refetchLocal]);

  /** Derive selected PR and hasPRs early so they can be used in effects */
  const selected = linkedPRs.find((pr) => pr.prNumber === selectedPR) ?? linkedPRs[0] ?? null;
  const hasPRs = linkedPRs.length > 0;

  /** Expose full changes view state to parent for header rendering */
  useEffect(() => {
    if (onChangesViewState) {
      onChangesViewState({
        source,
        setSource,
        selectedPR: selected,
        hasPRs,
        localChanges: {
          data: localChanges,
          isFetching: localFetching,
          refetch: refetchLocal,
        },
        prChanges: {
          isFetching: prFetching,
          refetch: () => setPRRefetchTrigger((prev) => prev + 1),
        },
      });
    }
  }, [
    onChangesViewState,
    source,
    selected,
    hasPRs,
    localChanges,
    localFetching,
    refetchLocal,
    prFetching,
  ]);

  /** Auto-select first PR when available */
  useEffect(() => {
    if (linkedPRs.length > 0 && selectedPR === null) {
      const firstPR = linkedPRs[0];
      if (firstPR) {
        setSelectedPR(firstPR.prNumber);
      }
    }
  }, [linkedPRs, selectedPR]);

  /** PR status refresh - check GitHub for updated statuses */
  useEffect(() => {
    if (linkedPRs.length === 0 || !metadata.repo || !identity?.token) {
      return;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: GitHub API call with retry and error handling for multiple PRs
    const refreshPRStatus = async () => {
      for (const pr of linkedPRs) {
        try {
          const response = await fetch(
            `https://api.github.com/repos/${metadata.repo}/pulls/${pr.prNumber}`,
            {
              headers: {
                Authorization: `Bearer ${identity.token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            }
          );

          if (!response.ok) {
            /** 404 = PR deleted or moved, just skip */
            if (response.status === 404) {
              continue;
            }
            throw new Error(`GitHub API error: ${response.statusText}`);
          }

          const data = await response.json();
          const newStatus = data.merged
            ? 'merged'
            : data.state === 'closed'
              ? 'closed'
              : data.draft
                ? 'draft'
                : 'open';

          /** Only update if status changed */
          if (newStatus !== pr.status) {
            updateLinkedPRStatus(ydoc, pr.prNumber, newStatus);
          }
        } catch (_error) {
          /** Continue with other PRs even if one fails */
        }
      }
    };

    refreshPRStatus();
  }, [linkedPRs, metadata.repo, identity?.token, ydoc]);

  return (
    <div className="max-w-full mx-auto p-2 md:p-4 h-full flex flex-col">
      {/* Content based on source - controls moved to header */}
      {source === 'local' ? (
        <div className="flex-1 min-h-0">
          <LocalChangesViewer
            data={localChanges}
            isLoading={localLoading}
            planId={metadata.id}
            ydoc={ydoc}
          />
        </div>
      ) : (
        <>
          {/* PR List (when multiple PRs) */}
          {linkedPRs.length > 1 && (
            <div className="space-y-1.5 mb-2">
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

          {/* Selected PR diff viewer - no header bar, controls in top header */}
          {selected && (
            <DiffViewer
              pr={selected}
              repo={metadata.repo || ''}
              ydoc={ydoc}
              refetchTrigger={prRefetchTrigger}
              onFetchingChange={setPRFetching}
            />
          )}
        </>
      )}
    </div>
  );
}

/** --- Subcomponents --- */

interface PRCardProps {
  pr: LinkedPR;
  selected: boolean;
  onSelect: () => void;
}

function PRCard({ pr, selected, onSelect }: PRCardProps) {
  /** Map PR status to HeroUI Chip color using exhaustive switch */
  const getStatusColor = (
    status: LinkedPR['status']
  ): 'default' | 'success' | 'accent' | 'danger' => {
    switch (status) {
      case 'draft':
        return 'default';
      case 'open':
        return 'success';
      case 'merged':
        return 'accent';
      case 'closed':
        return 'danger';
      default:
        assertNever(status);
    }
  };
  const statusColor = getStatusColor(pr.status);

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

interface DiffViewerProps {
  pr: LinkedPR;
  repo: string;
  ydoc: Y.Doc;
  refetchTrigger?: number;
  onFetchingChange?: (isFetching: boolean) => void;
}

function DiffViewer({ pr, repo, ydoc, refetchTrigger = 0, onFetchingChange }: DiffViewerProps) {
  const [files, setFiles] = useState<PRFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getDiffViewModePreference);
  const { identity } = useGitHubAuth();

  /** Get all comments for this PR */
  const comments = usePRReviewComments(ydoc, pr.prNumber);

  /** Memoize commentSupport to prevent unnecessary re-renders of FileDiffView */
  const commentSupport = useMemo(
    () => ({
      type: 'pr' as const,
      prNumber: pr.prNumber,
      comments,
      ydoc,
      currentUser: identity?.username,
    }),
    [pr.prNumber, comments, ydoc, identity?.username]
  );

  /** Handle view mode change with localStorage persistence */
  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
    setDiffViewModePreference(mode);
  }, []);

  /** Count comments per file */
  const commentCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) {
      const current = counts.get(comment.path) ?? 0;
      counts.set(comment.path, current + 1);
    }
    return counts;
  }, [comments]);

  /** Build file tree (must be before conditional returns!) */
  const fileTree = useMemo(() => buildFileTreeData(files), [files]);
  const treeRef = useRef<TreeApi<FileTreeData>>(null);

  /** Handle file selection from tree (MUST be before conditional returns!) */
  const handleFileSelect = useCallback((nodes: NodeApi<FileTreeData>[]) => {
    /** react-arborist passes NodeApi objects */
    const node = nodes[0];
    if (!node) return;

    /** Get the file from the node's data */
    const fileData = node.data;
    if (fileData.file) {
      setSelectedFile(fileData.file.filename);
    }
  }, []);

  /** Create node renderer with comment counts (MUST be before conditional returns!) */
  const NodeRenderer = useMemo(
    () => createFileTreeNode(commentCountByFile, setSelectedFile),
    [commentCountByFile]
  );

  /** Fetch file list directly from GitHub API */
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetchTrigger intentionally triggers re-fetch when incremented
  useEffect(() => {
    if (!repo) return;

    setLoading(true);
    setError(null);
    onFetchingChange?.(true);

    /** Build headers with optional auth for private repos */
    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
    };
    if (identity?.token) {
      headers.Authorization = `Bearer ${identity.token}`;
    }

    /** Fetch directly from GitHub API */
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
          onFetchingChange?.(false);
        }
      )
      .catch((err) => {
        setError(err.message);
        setLoading(false);
        onFetchingChange?.(false);
      });
  }, [pr.prNumber, repo, identity?.token, refetchTrigger, onFetchingChange]);

  /** Auto-select first file when files load */
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
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-2">
      {/* File tree sidebar */}
      <div className="border border-separator rounded-lg overflow-hidden flex flex-col max-h-[600px]">
        <div className="px-3 py-2 border-b border-separator bg-surface">
          <span className="text-sm font-medium">
            {files.length} file{files.length !== 1 ? 's' : ''} changed
          </span>
        </div>
        <div className="overflow-hidden flex-1">
          <Tree
            ref={treeRef}
            data={fileTree}
            onSelect={handleFileSelect}
            openByDefault={false}
            disableDrag
            disableDrop
            width="100%"
            height={600}
            indent={16}
            rowHeight={32}
          >
            {NodeRenderer}
          </Tree>
        </div>
      </div>

      {/* Diff View for Selected File */}
      <div>
        {selectedFile ? (
          <FileDiffView
            filename={selectedFile}
            patch={files.find((f) => f.filename === selectedFile)?.patch}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            commentSupport={commentSupport}
          />
        ) : (
          <Card>
            <Card.Content className="p-8 text-center">
              <p className="text-muted-foreground">Select a file to view the diff</p>
            </Card.Content>
          </Card>
        )}
      </div>
    </div>
  );
}

/** --- Helper Components --- */

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

/** --- File Tree Types and Helpers (react-arborist) --- */

interface FileTreeData {
  id: string;
  name: string;
  children?: FileTreeData[];
  file?: PRFile;
}

/**
 * Build tree data structure for react-arborist from flat file list
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tree building requires nested loops and recursive sorting
function buildFileTreeData(files: PRFile[]): FileTreeData[] {
  const root: FileTreeData = {
    id: '__root__',
    name: '',
    children: [],
  };

  for (const file of files) {
    const parts = file.filename.split('/').filter(Boolean);
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      /** Find existing child or create new one */
      let childNode = currentNode.children?.find((c) => c.name === part);

      if (!childNode) {
        childNode = {
          id: path,
          name: part,
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
        };
        currentNode.children?.push(childNode);
      }

      /** Move to next level if folder */
      if (!isFile) {
        currentNode = childNode;
      }
    }
  }

  /** Sort recursively */
  const sortNodes = (nodes: FileTreeData[]): FileTreeData[] => {
    return nodes
      .sort((a, b) => {
        /** Folders before files */
        const aIsFolder = a.children !== undefined;
        const bIsFolder = b.children !== undefined;
        if (aIsFolder !== bIsFolder) {
          return aIsFolder ? -1 : 1;
        }
        /** Alphabetical */
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined,
      }));
  };

  return sortNodes(root.children || []);
}

/**
 * Custom node renderer for react-arborist using HeroUI styling
 */
function createFileTreeNode(
  commentCountByFile: Map<string, number>,
  onFileClick: (filename: string) => void
) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Node renderer requires conditional rendering, stat display, comment badges
  return function FileTreeNode({ node, style }: NodeRendererProps<FileTreeData>) {
    const isFolder = node.data.children !== undefined;
    const commentCount = node.data.file
      ? (commentCountByFile.get(node.data.file.filename) ?? 0)
      : 0;

    if (isFolder) {
      return (
        <button
          type="button"
          style={style}
          onClick={() => node.toggle()}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-left text-sm hover:bg-surface rounded transition-colors"
        >
          <ChevronRight
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
              node.isOpen ? 'rotate-90' : ''
            }`}
          />
          <Folder className="w-4 h-4 text-muted-foreground" />
          <span className="text-foreground font-medium">{node.data.name}</span>
        </button>
      );
    }

    /** File node */
    return (
      <button
        type="button"
        style={style}
        onClick={() => {
          node.select();
          if (node.data.file) {
            onFileClick(node.data.file.filename);
          }
        }}
        className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm rounded transition-colors ${
          node.isSelected ? 'bg-primary text-white' : 'hover:bg-surface'
        }`}
        title={node.data.file?.filename}
      >
        <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs truncate flex-1">{node.data.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {commentCount > 0 && (
            <span
              className={`flex items-center gap-0.5 text-xs ${
                node.isSelected ? 'text-white/80' : 'text-primary'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              {commentCount}
            </span>
          )}
          {node.data.file && (
            <>
              <span className={`text-xs ${node.isSelected ? 'text-white/80' : 'text-success'}`}>
                +{node.data.file.additions}
              </span>
              <span className={`text-xs ${node.isSelected ? 'text-white/80' : 'text-danger'}`}>
                -{node.data.file.deletions}
              </span>
            </>
          )}
        </div>
      </button>
    );
  };
}
