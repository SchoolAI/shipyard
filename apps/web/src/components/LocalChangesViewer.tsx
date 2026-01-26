/**
 * Viewer component for local git changes.
 * Shows file tree and diff viewer, similar to PRDiffViewer.
 * Supports commenting on local diffs with staleness detection.
 */
import { Alert, Button, Card, Chip } from '@heroui/react';
import type {
  ChangeSnapshot,
  LocalChangesResponse,
  LocalChangesResult,
  LocalFileChange,
} from '@shipyard/schema';
import { Check, ChevronRight, CircleDot, FileText, Folder, GitBranch, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeApi, type NodeRendererProps, Tree, type TreeApi } from 'react-arborist';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useLocalDiffComments } from '@/hooks/useLocalDiffComments';
import { trpc } from '@/utils/trpc';
import { type CommentSupport, type DiffViewMode, FileDiffView } from './diff';

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

/** --- Component Props --- */

interface LocalChangesViewerProps {
  data: LocalChangesResult | undefined;
  isLoading: boolean;
  planId: string;
  /** Y.Doc for comment storage (required for commenting support) */
  ydoc?: Y.Doc;
  /** Remote snapshot to display instead of local data */
  remoteSnapshot?: ChangeSnapshot;
  /** Whether viewing remote machine's changes (disables commenting) */
  isRemote?: boolean;
}

function convertSnapshotToLocalChanges(snapshot: ChangeSnapshot): LocalChangesResponse {
  const stagedFiles: LocalFileChange[] = [];
  const unstagedFiles: LocalFileChange[] = [];

  for (const file of snapshot.files) {
    const localFile: LocalFileChange = {
      path: file.path,
      status: file.status,
      additions: file.patch.split('\n').filter((l) => l.startsWith('+')).length,
      deletions: file.patch.split('\n').filter((l) => l.startsWith('-')).length,
      patch: file.patch,
    };

    if (file.staged) {
      stagedFiles.push(localFile);
    } else {
      unstagedFiles.push(localFile);
    }
  }

  return {
    available: true,
    branch: snapshot.branch,
    baseBranch: 'HEAD',
    headSha: snapshot.headSha,
    staged: stagedFiles,
    unstaged: unstagedFiles,
    untracked: [],
    files: [...stagedFiles, ...unstagedFiles],
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multiple conditional states (loading, unavailable, empty, available) require branching
export function LocalChangesViewer({
  data,
  isLoading,
  planId,
  ydoc,
  remoteSnapshot,
  isRemote = false,
}: LocalChangesViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getDiffViewModePreference);

  const effectiveData = useMemo(() => {
    if (remoteSnapshot) {
      return convertSnapshotToLocalChanges(remoteSnapshot);
    }
    return data;
  }, [remoteSnapshot, data]);

  /** Handle view mode change with localStorage persistence */
  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
    setDiffViewModePreference(mode);
  }, []);

  /** Loading state */
  if (isLoading && !remoteSnapshot) {
    return (
      <Card>
        <Card.Content className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">Loading local changes...</p>
        </Card.Content>
      </Card>
    );
  }

  /** Unavailable state */
  if (!effectiveData || !effectiveData.available) {
    const reason = effectiveData && !effectiveData.available ? effectiveData.reason : 'unknown';
    const message =
      effectiveData && !effectiveData.available
        ? effectiveData.message
        : 'Local changes unavailable';

    return (
      <Alert status={reason === 'no_cwd' ? 'default' : 'warning'}>
        <Alert.Content>
          <Alert.Title>
            {reason === 'no_cwd'
              ? 'No Working Directory'
              : reason === 'not_git_repo'
                ? 'Not a Git Repository'
                : reason === 'mcp_not_connected'
                  ? 'MCP Not Connected'
                  : 'Git Error'}
          </Alert.Title>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  /** Available state - show files and diff */
  return (
    <LocalChangesContent
      data={effectiveData}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      planId={planId}
      ydoc={isRemote ? undefined : ydoc}
    />
  );
}

/** --- Content Component (when data is available) --- */

interface LocalChangesContentProps {
  data: LocalChangesResponse;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  planId: string;
  ydoc?: Y.Doc;
}

/**
 * Build a map of file path -> additions/deletions from the files array.
 * This is used to show +/- counts for staged/unstaged files in the tree.
 */
function buildFileStatsMap(
  files: LocalFileChange[]
): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const file of files) {
    map.set(file.path, { additions: file.additions, deletions: file.deletions });
  }
  return map;
}

function LocalChangesContent({
  data,
  selectedFile,
  setSelectedFile,
  viewMode,
  onViewModeChange,
  planId,
  ydoc,
}: LocalChangesContentProps) {
  const treeRef = useRef<TreeApi<FileTreeData>>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { identity } = useGitHubAuth();

  /** Memoize sidebar expand callback to prevent FileDiffView re-renders */
  const handleExpandSidebar = useCallback(() => setSidebarCollapsed(false), []);

  /** Get HEAD SHA for staleness detection */
  const currentHeadSha = data.headSha;

  /**
   * Get local diff comments from CRDT (only if ydoc is provided).
   * Uses empty Y.Doc as fallback when no ydoc is provided.
   */
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Empty object fallback when ydoc is not provided, hook handles undefined gracefully
  const localComments = useLocalDiffComments(ydoc ?? ({} as Y.Doc), currentHeadSha);

  /** Build stats map from files array (has accurate additions/deletions from diff parsing) */
  const fileStatsMap = useMemo(() => buildFileStatsMap(data.files), [data.files]);

  /** Build grouped file tree with sections for staged/unstaged/untracked */
  const fileTree = useMemo(() => buildGroupedFileTree(data, fileStatsMap), [data, fileStatsMap]);

  /** Helper to check if file is untracked */
  const isUntrackedFile = useCallback(
    (path: string) => data.untracked.includes(path),
    [data.untracked]
  );

  /** Auto-select first file when data loads */
  useEffect(() => {
    if (data.files.length > 0 && selectedFile === null) {
      const firstFile = data.files[0];
      if (firstFile) {
        setSelectedFile(firstFile.path);
      }
    }
  }, [data.files, selectedFile, setSelectedFile]);

  /** Handle file selection from tree */
  const handleFileSelect = useCallback(
    (nodes: NodeApi<FileTreeData>[]) => {
      const node = nodes[0];
      if (!node) return;
      const fileData = node.data;
      if (fileData.file) {
        setSelectedFile(fileData.file.path);
      }
    },
    [setSelectedFile]
  );

  /** Create node renderer */
  const NodeRenderer = useMemo(() => createFileTreeNode(setSelectedFile), [setSelectedFile]);

  /** Find selected file data */
  const selectedFileData = data.files.find((f) => f.path === selectedFile);

  /** Build comment support for FileDiffView (only when ydoc is available) */
  const commentSupport = useMemo(() => {
    if (!ydoc) return undefined;

    return {
      type: 'local' as const,
      comments: localComments,
      ydoc,
      currentUser: identity?.username,
      currentHeadSha,
    };
  }, [ydoc, localComments, identity?.username, currentHeadSha]);

  /** No changes state */
  if (data.files.length === 0 && data.untracked.length === 0) {
    return (
      <Card>
        <Card.Content className="p-8 text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Local Changes</h3>
          <p className="text-muted-foreground">
            Your working directory is clean on branch <code className="text-xs">{data.branch}</code>
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* File tree and diff viewer - header moved to tab bar */}
      <div
        className={`grid grid-cols-1 gap-2 flex-1 min-h-0 ${sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[300px_1fr]'}`}
      >
        {/* File tree sidebar */}
        {!sidebarCollapsed && (
          <div className="border border-separator rounded-lg overflow-hidden flex flex-col h-full min-h-0">
            <div className="px-3 py-2 border-b border-separator bg-surface flex items-center justify-between">
              <span className="text-sm font-medium">Changed Files</span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 hover:bg-surface-hover rounded transition-colors"
                aria-label="Collapse sidebar"
              >
                <ChevronRight className="w-4 h-4 rotate-180 text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <Tree
                ref={treeRef}
                data={fileTree}
                onSelect={handleFileSelect}
                openByDefault={true}
                disableDrag
                disableDrop
                width="100%"
                height={2000}
                indent={16}
                rowHeight={32}
              >
                {NodeRenderer}
              </Tree>
            </div>
          </div>
        )}

        {/* Diff viewer */}
        <div className="flex flex-col h-full min-h-0 overflow-y-auto">
          {selectedFile && (selectedFileData || isUntrackedFile(selectedFile)) ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {selectedFileData ? (
                <FileDiffView
                  filename={selectedFile}
                  patch={selectedFileData.patch}
                  viewMode={viewMode}
                  onViewModeChange={onViewModeChange}
                  sidebarCollapsed={sidebarCollapsed}
                  onExpandSidebar={handleExpandSidebar}
                  commentSupport={commentSupport}
                />
              ) : (
                <UntrackedFileView
                  filename={selectedFile}
                  planId={planId}
                  viewMode={viewMode}
                  onViewModeChange={onViewModeChange}
                  sidebarCollapsed={sidebarCollapsed}
                  onExpandSidebar={handleExpandSidebar}
                  commentSupport={commentSupport}
                />
              )}
            </div>
          ) : (
            <Card>
              <Card.Content className="p-8 text-center">
                {sidebarCollapsed ? (
                  <>
                    <p className="text-muted-foreground mb-4">File tree is collapsed</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => setSidebarCollapsed(false)}
                    >
                      <ChevronRight className="w-4 h-4" />
                      Show File Tree
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a file to view the diff</p>
                )}
              </Card.Content>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** --- File Tree Types and Helpers --- */

type StagingStatus = 'staged' | 'unstaged' | 'untracked';

interface FileTreeData {
  id: string;
  name: string;
  children?: FileTreeData[];
  file?: LocalFileChange;
  stagingStatus?: StagingStatus;
  /** For section headers */
  isSection?: boolean;
  category?: StagingStatus;
}

/**
 * Build grouped file tree with sections for staged/unstaged/untracked files.
 * Uses fileStatsMap to get accurate additions/deletions from the diff parsing.
 */
function buildGroupedFileTree(
  data: LocalChangesResponse,
  fileStatsMap: Map<string, { additions: number; deletions: number }>
): FileTreeData[] {
  const sections: FileTreeData[] = [];

  /** Helper to enrich files with stats from the map */
  const enrichWithStats = (files: LocalFileChange[]): LocalFileChange[] =>
    files.map((f) => {
      const stats = fileStatsMap.get(f.path);
      return stats ? { ...f, additions: stats.additions, deletions: stats.deletions } : f;
    });

  /** Staged section */
  if (data.staged.length > 0) {
    sections.push({
      id: '__staged__',
      name: `Staged Changes (${data.staged.length})`,
      isSection: true,
      category: 'staged',
      children: buildFileTreeForStatus(enrichWithStats(data.staged), 'staged'),
    });
  }

  /** Unstaged section */
  if (data.unstaged.length > 0) {
    sections.push({
      id: '__unstaged__',
      name: `Unstaged Changes (${data.unstaged.length})`,
      isSection: true,
      category: 'unstaged',
      children: buildFileTreeForStatus(enrichWithStats(data.unstaged), 'unstaged'),
    });
  }

  /** Untracked section */
  if (data.untracked.length > 0) {
    const untrackedFiles: LocalFileChange[] = data.untracked.map((path) => ({
      path,
      status: 'untracked',
      additions: 0,
      deletions: 0,
    }));
    sections.push({
      id: '__untracked__',
      name: `Untracked Files (${data.untracked.length})`,
      isSection: true,
      category: 'untracked',
      children: buildFileTreeForStatus(untrackedFiles, 'untracked'),
    });
  }

  return sections;
}

/**
 * Build tree data structure for a specific staging status
 */
function buildFileTreeForStatus(files: LocalFileChange[], status: StagingStatus): FileTreeData[] {
  return buildFileTreeData(files, status);
}

/**
 * Build tree data structure for react-arborist from flat file list.
 *
 * IMPORTANT: Node IDs must be unique across the entire tree. Since the same
 * directory path can appear in multiple sections (staged, unstaged, untracked),
 * we prefix all IDs with the staging status to ensure uniqueness.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tree building requires nested loops and recursive sorting
function buildFileTreeData(
  files: LocalFileChange[],
  stagingStatus?: StagingStatus
): FileTreeData[] {
  const root: FileTreeData = {
    id: '__root__',
    name: '',
    children: [],
  };

  /** Prefix ensures unique IDs when same paths appear in multiple sections */
  const idPrefix = stagingStatus ? `${stagingStatus}:` : '';

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');
      /** Use prefixed ID to avoid collisions across sections */
      const nodeId = `${idPrefix}${path}`;

      /** Find existing child or create new one */
      let childNode = currentNode.children?.find((c) => c.id === nodeId);

      if (!childNode) {
        childNode = {
          id: nodeId,
          name: part,
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
          stagingStatus: isFile ? stagingStatus : undefined,
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
 * Custom node renderer for react-arborist with staging status indicators
 */
function createFileTreeNode(onFileClick: (path: string) => void) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Renders 3 node types (sections, folders, files) with different styling and behaviors - inherent to tree UI
  return function FileTreeNode({ node, style }: NodeRendererProps<FileTreeData>) {
    /** Section header (Staged/Unstaged/Untracked) */
    if (node.data.isSection) {
      const category = node.data.category;
      const sectionIcons = {
        staged: <Check className="w-4 h-4" />,
        unstaged: <CircleDot className="w-4 h-4" />,
        untracked: <Plus className="w-4 h-4" />,
      };
      const sectionColors = {
        staged: 'text-success',
        unstaged: 'text-warning',
        untracked: 'text-muted-foreground',
      };

      return (
        <button
          type="button"
          style={style}
          onClick={() => node.toggle()}
          className={`flex items-center gap-2 w-full px-2 py-2 text-left text-sm font-semibold
            border-l-2 ${category === 'staged' ? 'border-l-success' : category === 'unstaged' ? 'border-l-warning' : 'border-l-muted'}
            ${sectionColors[category || 'unstaged']}`}
        >
          <ChevronRight
            className={`w-4 h-4 transition-transform ${node.isOpen ? 'rotate-90' : ''}`}
          />
          {category && sectionIcons[category]}
          <span>{node.data.name}</span>
        </button>
      );
    }

    /** Folder node */
    const isFolder = node.data.children !== undefined && !node.data.isSection;
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

    /** File node with staging status indicator */
    const file = node.data.file;
    const stagingStatus = node.data.stagingStatus;

    const statusStyles = {
      staged: {
        borderClass: 'border-l-2 border-l-success',
        iconClass: 'text-success',
        icon: <Check className="w-3 h-3" />,
      },
      unstaged: {
        borderClass: 'border-l-2 border-l-warning',
        iconClass: 'text-warning',
        icon: <CircleDot className="w-3 h-3" />,
      },
      untracked: {
        borderClass: 'border-l-2 border-l-muted border-dashed',
        iconClass: 'text-muted-foreground',
        icon: <Plus className="w-3 h-3" />,
      },
    };

    const styles = stagingStatus ? statusStyles[stagingStatus] : statusStyles.unstaged;

    return (
      <button
        type="button"
        style={style}
        onClick={() => {
          node.select();
          if (file) {
            onFileClick(file.path);
          }
        }}
        className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm rounded transition-colors ${styles.borderClass} ${
          node.isSelected ? 'bg-primary text-white' : 'hover:bg-surface'
        }`}
        title={file?.path}
      >
        {/* Status icon */}
        <span className={`shrink-0 ${node.isSelected ? 'text-white/80' : styles.iconClass}`}>
          {styles.icon}
        </span>

        <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs truncate flex-1">{node.data.name}</span>

        {/* Additions/deletions (hide for untracked files) */}
        {file && stagingStatus !== 'untracked' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-xs ${node.isSelected ? 'text-white/80' : 'text-success'}`}>
              +{file.additions}
            </span>
            <span className={`text-xs ${node.isSelected ? 'text-white/80' : 'text-danger'}`}>
              -{file.deletions}
            </span>
          </div>
        )}
      </button>
    );
  };
}

/** --- Diff View Components --- */

/**
 * Props for UntrackedFileView component.
 */
interface UntrackedFileViewProps {
  filename: string;
  planId: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  commentSupport?: CommentSupport;
}

/**
 * View for untracked files - fetches full file content and displays as a diff.
 * Uses FileDiffView to enable commenting support.
 */
function UntrackedFileView({
  filename,
  planId,
  viewMode,
  onViewModeChange,
  sidebarCollapsed,
  onExpandSidebar,
  commentSupport,
}: UntrackedFileViewProps) {
  /** Fetch file content via tRPC */
  const { data, isLoading, error } = trpc.plan.getFileContent.useQuery(
    { planId, filePath: filename },
    { retry: false, staleTime: 30000 }
  );

  /** Loading state */
  if (isLoading) {
    return (
      <Card>
        <Card.Header>
          <Card.Title className="font-mono text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-success" />
            {filename}
            <Chip size="sm" color="success">
              New File
            </Chip>
          </Card.Title>
        </Card.Header>
        <Card.Content className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">Loading file content...</p>
        </Card.Content>
      </Card>
    );
  }

  /** Error or no content */
  if (error || !data?.content) {
    return (
      <Card>
        <Card.Header>
          <Card.Title className="font-mono text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-success" />
            {filename}
            <Chip size="sm" color="success">
              New File
            </Chip>
          </Card.Title>
        </Card.Header>
        <Card.Content className="p-8 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">New Untracked File</h3>
          <p className="text-muted-foreground mb-4">
            {data?.error || 'Could not load file content.'}
          </p>
          <p className="text-xs text-muted-foreground">
            Run <code className="bg-surface px-1 py-0.5 rounded">git add {filename}</code> to stage
            this file.
          </p>
        </Card.Content>
      </Card>
    );
  }

  /** Generate patch for new file - all lines as additions with proper hunk header */
  const lines = data.content.split('\n');
  const patch = `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}`;

  return (
    <FileDiffView
      filename={filename}
      patch={patch}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      sidebarCollapsed={sidebarCollapsed}
      onExpandSidebar={onExpandSidebar}
      commentSupport={commentSupport}
    />
  );
}
