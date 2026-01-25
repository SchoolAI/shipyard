/**
 * Viewer component for local git changes.
 * Shows file tree and diff viewer, similar to PRDiffViewer.
 */
import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Alert, Button, ButtonGroup, Card, Chip } from '@heroui/react';
import type { LocalChangesResponse, LocalChangesResult, LocalFileChange } from '@shipyard/schema';
import {
  Check,
  ChevronRight,
  CircleDot,
  Columns2,
  FileText,
  Folder,
  GitBranch,
  Plus,
  Rows3,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeApi, type NodeRendererProps, Tree, type TreeApi } from 'react-arborist';
import { trpc } from '@/utils/trpc';

// --- Types ---

type DiffViewMode = 'unified' | 'split';

// --- LocalStorage Helpers ---

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
    // Ignore localStorage errors
  }
}

// --- Component Props ---

interface LocalChangesViewerProps {
  data: LocalChangesResult | undefined;
  isLoading: boolean;
  planId: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multiple conditional states (loading, unavailable, empty, available) require branching
export function LocalChangesViewer({ data, isLoading, planId }: LocalChangesViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getDiffViewModePreference);

  // Handle view mode change with localStorage persistence
  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
    setDiffViewModePreference(mode);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <Card.Content className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">Loading local changes...</p>
        </Card.Content>
      </Card>
    );
  }

  // Unavailable state
  if (!data || !data.available) {
    const reason = data && !data.available ? data.reason : 'unknown';
    const message = data && !data.available ? data.message : 'Local changes unavailable';

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

  // Available state - show files and diff
  return (
    <LocalChangesContent
      data={data}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      planId={planId}
    />
  );
}

// --- Content Component (when data is available) ---

interface LocalChangesContentProps {
  data: LocalChangesResponse;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  planId: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles file tree, diff viewer, collapse state, file selection with multiple conditionals
function LocalChangesContent({
  data,
  selectedFile,
  setSelectedFile,
  viewMode,
  onViewModeChange,
  planId,
}: LocalChangesContentProps) {
  const treeRef = useRef<TreeApi<FileTreeData>>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Build grouped file tree with sections for staged/unstaged/untracked
  const fileTree = useMemo(() => buildGroupedFileTree(data), [data]);

  // Helper to check if file is untracked
  const isUntrackedFile = useCallback(
    (path: string) => data.untracked.includes(path),
    [data.untracked]
  );

  // Auto-select first file when data loads
  useEffect(() => {
    if (data.files.length > 0 && selectedFile === null) {
      const firstFile = data.files[0];
      if (firstFile) {
        setSelectedFile(firstFile.path);
      }
    }
  }, [data.files, selectedFile, setSelectedFile]);

  // Handle file selection from tree
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

  // Create node renderer
  const NodeRenderer = useMemo(() => createFileTreeNode(setSelectedFile), [setSelectedFile]);

  // Find selected file data
  const selectedFileData = data.files.find((f) => f.path === selectedFile);

  // No changes state
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
            <div className="flex flex-col h-full min-h-0">
              {/* Diff controls */}
              <div className="flex items-center justify-between px-2 shrink-0 py-2">
                <div className="flex items-center gap-2">
                  {sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => setSidebarCollapsed(false)}
                      className="p-1 hover:bg-surface-hover rounded transition-colors"
                      aria-label="Expand sidebar"
                    >
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                  <span className="text-sm text-muted-foreground font-mono">{selectedFile}</span>
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
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {selectedFileData ? (
                  <FileDiffView
                    filename={selectedFile}
                    patch={selectedFileData.patch}
                    viewMode={viewMode}
                  />
                ) : (
                  <UntrackedFileView filename={selectedFile} planId={planId} viewMode={viewMode} />
                )}
              </div>
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

// --- File Tree Types and Helpers ---

type StagingStatus = 'staged' | 'unstaged' | 'untracked';

interface FileTreeData {
  id: string;
  name: string;
  children?: FileTreeData[];
  file?: LocalFileChange;
  stagingStatus?: StagingStatus;
  // For section headers
  isSection?: boolean;
  category?: StagingStatus;
}

/**
 * Build grouped file tree with sections for staged/unstaged/untracked files
 */
function buildGroupedFileTree(data: LocalChangesResponse): FileTreeData[] {
  const sections: FileTreeData[] = [];

  // Staged section
  if (data.staged.length > 0) {
    sections.push({
      id: '__staged__',
      name: `Staged Changes (${data.staged.length})`,
      isSection: true,
      category: 'staged',
      children: buildFileTreeForStatus(data.staged, 'staged'),
    });
  }

  // Unstaged section
  if (data.unstaged.length > 0) {
    sections.push({
      id: '__unstaged__',
      name: `Unstaged Changes (${data.unstaged.length})`,
      isSection: true,
      category: 'unstaged',
      children: buildFileTreeForStatus(data.unstaged, 'unstaged'),
    });
  }

  // Untracked section
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
 * Build tree data structure for react-arborist from flat file list
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

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      // Find existing child or create new one
      let childNode = currentNode.children?.find((c) => c.name === part);

      if (!childNode) {
        childNode = {
          id: path,
          name: part,
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
          stagingStatus: isFile ? stagingStatus : undefined,
        };
        currentNode.children?.push(childNode);
      }

      // Move to next level if folder
      if (!isFile) {
        currentNode = childNode;
      }
    }
  }

  // Sort recursively
  const sortNodes = (nodes: FileTreeData[]): FileTreeData[] => {
    return nodes
      .sort((a, b) => {
        // Folders before files
        const aIsFolder = a.children !== undefined;
        const bIsFolder = b.children !== undefined;
        if (aIsFolder !== bIsFolder) {
          return aIsFolder ? -1 : 1;
        }
        // Alphabetical
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
    // Section header (Staged/Unstaged/Untracked)
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

    // Folder node
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

    // File node with staging status indicator
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

// --- Diff View Components ---

/**
 * View for untracked files - fetches and displays full file content
 */
function UntrackedFileView({
  filename,
  planId,
  viewMode,
}: {
  filename: string;
  planId: string;
  viewMode: DiffViewMode;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Fetch file content via tRPC
  const { data, isLoading, error } = trpc.plan.getFileContent.useQuery(
    { planId, filePath: filename },
    { retry: false, staleTime: 30000 }
  );

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

  // Loading state
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

  // Error or no content
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

  // Generate fake diff - all lines as additions
  const lines = data.content.split('\n');
  const patch = lines.map((line) => `+${line}`).join('\n');
  const fileLang = filename.split('.').pop() || 'text';

  // Construct unified diff format for new file
  const fullDiff = `diff --git a/${filename} b/${filename}
new file mode 100644
--- /dev/null
+++ b/${filename}
@@ -0,0 +1,${lines.length} @@
${patch}`;

  return (
    <Card>
      <Card.Header>
        <Card.Title className="font-mono text-sm flex items-center gap-2">
          <Plus className="w-4 h-4 text-success" />
          {filename}
          <Chip size="sm" color="success">
            New File
          </Chip>
          <span className="text-xs text-success ml-auto">+{lines.length}</span>
        </Card.Title>
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
            The diff for <code>{filename}</code> is not available (may be a binary file).
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  // Detect file language from extension for syntax highlighting
  const fileLang = filename.split('.').pop() || 'text';

  // Construct a proper unified diff string
  // The patch from git-local-changes already includes the @@ hunks
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
