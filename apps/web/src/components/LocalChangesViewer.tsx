/**
 * Viewer component for local git changes.
 * Shows file tree and diff viewer, similar to PRDiffViewer.
 */
import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Alert, Button, ButtonGroup, Card, Chip } from '@heroui/react';
import type { LocalChangesResponse, LocalChangesResult, LocalFileChange } from '@shipyard/schema';
import {
  ChevronRight,
  Columns2,
  FileText,
  Folder,
  GitBranch,
  RefreshCw,
  Rows3,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeApi, type NodeRendererProps, Tree, type TreeApi } from 'react-arborist';

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
  isFetching: boolean;
  onRefresh: () => void;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multiple conditional states (loading, unavailable, empty, available) require branching
export function LocalChangesViewer({
  data,
  isLoading,
  isFetching,
  onRefresh,
}: LocalChangesViewerProps) {
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
      isFetching={isFetching}
      onRefresh={onRefresh}
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
  isFetching: boolean;
  onRefresh: () => void;
}

function LocalChangesContent({
  data,
  selectedFile,
  setSelectedFile,
  viewMode,
  onViewModeChange,
  isFetching,
  onRefresh,
}: LocalChangesContentProps) {
  const treeRef = useRef<TreeApi<FileTreeData>>(null);

  // Build file tree from local changes
  const fileTree = useMemo(() => buildFileTreeData(data.files), [data.files]);

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
    <div className="space-y-2">
      {/* Header with branch info and refresh */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-surface rounded-lg border border-separator">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <code className="text-sm font-medium">{data.branch}</code>
          <Chip size="sm" color="default">
            {data.files.length} file{data.files.length !== 1 ? 's' : ''} changed
          </Chip>
          {data.staged.length > 0 && (
            <Chip size="sm" color="success">
              {data.staged.length} staged
            </Chip>
          )}
          {data.untracked.length > 0 && (
            <Chip size="sm" color="warning">
              {data.untracked.length} untracked
            </Chip>
          )}
        </div>
        <Button
          size="sm"
          variant="tertiary"
          onPress={onRefresh}
          isDisabled={isFetching}
          isPending={isFetching}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* File tree and diff viewer */}
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-2">
        {/* File tree sidebar */}
        <div className="border border-separator rounded-lg overflow-hidden flex flex-col max-h-[600px]">
          <div className="px-3 py-2 border-b border-separator bg-surface">
            <span className="text-sm font-medium">Changed Files</span>
          </div>
          <div className="overflow-hidden flex-1">
            <Tree
              ref={treeRef}
              data={fileTree}
              onSelect={handleFileSelect}
              openByDefault={true}
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

        {/* Diff viewer */}
        <div>
          {selectedFile && selectedFileData ? (
            <div className="space-y-2">
              {/* Diff controls */}
              <div className="flex items-center justify-between px-2">
                <span className="text-sm text-muted-foreground font-mono">{selectedFile}</span>
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
              <FileDiffView
                filename={selectedFile}
                patch={selectedFileData.patch}
                viewMode={viewMode}
              />
            </div>
          ) : (
            <Card>
              <Card.Content className="p-8 text-center">
                <p className="text-muted-foreground">Select a file to view the diff</p>
              </Card.Content>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// --- File Tree Types and Helpers ---

interface FileTreeData {
  id: string;
  name: string;
  children?: FileTreeData[];
  file?: LocalFileChange;
}

/**
 * Build tree data structure for react-arborist from flat file list
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tree building requires nested loops and recursive sorting
function buildFileTreeData(files: LocalFileChange[]): FileTreeData[] {
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
 * Custom node renderer for react-arborist
 */
function createFileTreeNode(onFileClick: (path: string) => void) {
  return function FileTreeNode({ node, style }: NodeRendererProps<FileTreeData>) {
    const isFolder = node.data.children !== undefined;

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

    // File node
    const file = node.data.file;
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
        className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm rounded transition-colors ${
          node.isSelected ? 'bg-primary text-white' : 'hover:bg-surface'
        }`}
        title={file?.path}
      >
        <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs truncate flex-1">{node.data.name}</span>
        {file && (
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

// --- Diff View Component ---

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
