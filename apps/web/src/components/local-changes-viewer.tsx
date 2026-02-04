import { Alert, Button, Card } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Check, ChevronRight, CircleDot, FileText, Folder, GitBranch } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeApi, type NodeRendererProps, Tree, type TreeApi } from 'react-arborist';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useTaskComments } from '@/loro/selectors/task-selectors';
import type { ChangeSnapshot, SyncedFileChange } from './changes-types';
import { type CommentSupport, type DiffViewMode, FileDiffView, type LocalComment } from './diff';

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
  } catch {}
}

interface LocalChangesViewerProps {
  changeSnapshot: ChangeSnapshot | null;
  isLoading: boolean;
  taskId: TaskId;
}

type StagingStatus = 'staged' | 'unstaged';

interface FileTreeData {
  id: string;
  name: string;
  children?: FileTreeData[];
  file?: SyncedFileChange;
  stagingStatus?: StagingStatus;
  isSection?: boolean;
  category?: StagingStatus;
}

function buildGroupedFileTree(snapshot: ChangeSnapshot): FileTreeData[] {
  const sections: FileTreeData[] = [];
  const stagedFiles = snapshot.files.filter((f) => f.staged);
  const unstagedFiles = snapshot.files.filter((f) => !f.staged);

  if (stagedFiles.length > 0) {
    sections.push({
      id: '__staged__',
      name: `Staged Changes (${stagedFiles.length})`,
      isSection: true,
      category: 'staged',
      children: buildFileTreeData(stagedFiles, 'staged'),
    });
  }

  if (unstagedFiles.length > 0) {
    sections.push({
      id: '__unstaged__',
      name: `Unstaged Changes (${unstagedFiles.length})`,
      isSection: true,
      category: 'unstaged',
      children: buildFileTreeData(unstagedFiles, 'unstaged'),
    });
  }

  return sections;
}

function sortLocalFileTreeNodes(nodes: FileTreeData[]): FileTreeData[] {
  return nodes
    .sort((a, b) => {
      const aIsFolder = a.children !== undefined;
      const bIsFolder = b.children !== undefined;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortLocalFileTreeNodes(node.children) : undefined,
    }));
}

function createFileTreeData(
  nodeId: string,
  part: string,
  isFile: boolean,
  file: SyncedFileChange,
  stagingStatus?: StagingStatus
): FileTreeData {
  return {
    id: nodeId,
    name: part,
    children: isFile ? undefined : [],
    file: isFile ? file : undefined,
    stagingStatus: isFile ? stagingStatus : undefined,
  };
}

function findOrCreateChild(
  parent: FileTreeData,
  nodeId: string,
  part: string,
  isFile: boolean,
  file: SyncedFileChange,
  stagingStatus?: StagingStatus
): FileTreeData {
  const existing = parent.children?.find((c) => c.id === nodeId);
  if (existing) return existing;

  const newNode = createFileTreeData(nodeId, part, isFile, file, stagingStatus);
  parent.children?.push(newNode);
  return newNode;
}

function insertLocalFileIntoTree(
  root: FileTreeData,
  file: SyncedFileChange,
  idPrefix: string,
  stagingStatus?: StagingStatus
): void {
  const parts = file.path.split('/').filter(Boolean);
  let currentNode = root;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const isFile = i === parts.length - 1;
    const path = parts.slice(0, i + 1).join('/');
    const nodeId = `${idPrefix}${path}`;

    const childNode = findOrCreateChild(currentNode, nodeId, part, isFile, file, stagingStatus);

    if (!isFile) {
      currentNode = childNode;
    }
  }
}

function buildFileTreeData(
  files: SyncedFileChange[],
  stagingStatus?: StagingStatus
): FileTreeData[] {
  const root: FileTreeData = { id: '__root__', name: '', children: [] };
  const idPrefix = stagingStatus ? `${stagingStatus}:` : '';

  for (const file of files) {
    insertLocalFileIntoTree(root, file, idPrefix, stagingStatus);
  }

  return sortLocalFileTreeNodes(root.children || []);
}

const SECTION_CONFIG = {
  staged: {
    icon: <Check className="w-4 h-4" />,
    colorClass: 'text-success',
    borderClass: 'border-l-success',
  },
  unstaged: {
    icon: <CircleDot className="w-4 h-4" />,
    colorClass: 'text-warning',
    borderClass: 'border-l-warning',
  },
} as const;

const STATUS_STYLES = {
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
} as const;

interface LocalSectionNodeProps {
  node: NodeApi<FileTreeData>;
  style: React.CSSProperties;
}

function LocalSectionNode({ node, style }: LocalSectionNodeProps) {
  const category = node.data.category ?? 'unstaged';
  const config = SECTION_CONFIG[category];

  return (
    <button
      type="button"
      style={style}
      onClick={() => node.toggle()}
      className={`flex items-center gap-2 w-full px-2 py-2 text-left text-sm font-semibold border-l-2 ${config.borderClass} ${config.colorClass}`}
    >
      <ChevronRight className={`w-4 h-4 transition-transform ${node.isOpen ? 'rotate-90' : ''}`} />
      {config.icon}
      <span>{node.data.name}</span>
    </button>
  );
}

interface LocalFolderNodeProps {
  node: NodeApi<FileTreeData>;
  style: React.CSSProperties;
}

function LocalFolderNode({ node, style }: LocalFolderNodeProps) {
  return (
    <button
      type="button"
      style={style}
      onClick={() => node.toggle()}
      className="flex items-center gap-1.5 w-full px-2 py-1 text-left text-sm hover:bg-surface rounded transition-colors"
    >
      <ChevronRight
        className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${node.isOpen ? 'rotate-90' : ''}`}
      />
      <Folder className="w-4 h-4 text-muted-foreground" />
      <span className="text-foreground font-medium">{node.data.name}</span>
    </button>
  );
}

function countPatchLines(patch: string): {
  additions: number;
  deletions: number;
} {
  const lines = patch.split('\n');
  const additions = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const deletions = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  return { additions, deletions };
}

interface LocalFileNodeProps {
  node: NodeApi<FileTreeData>;
  style: React.CSSProperties;
  onFileClick: (path: string) => void;
}

function LocalFileNode({ node, style, onFileClick }: LocalFileNodeProps) {
  const file = node.data.file;
  const stagingStatus = node.data.stagingStatus ?? 'unstaged';
  const statusStyle = STATUS_STYLES[stagingStatus];
  const { additions, deletions } = file
    ? countPatchLines(file.patch)
    : { additions: 0, deletions: 0 };
  const selectedClass = node.isSelected ? 'text-primary-foreground/80' : '';

  return (
    <button
      type="button"
      style={style}
      onClick={() => {
        node.select();
        if (file) onFileClick(file.path);
      }}
      className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm rounded transition-colors ${statusStyle.borderClass} ${node.isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-surface'}`}
      title={file?.path}
    >
      <span className={`shrink-0 ${selectedClass || statusStyle.iconClass}`}>
        {statusStyle.icon}
      </span>
      <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-xs truncate flex-1">{node.data.name}</span>
      {file && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs ${selectedClass || 'text-success'}`}>+{additions}</span>
          <span className={`text-xs ${selectedClass || 'text-danger'}`}>-{deletions}</span>
        </div>
      )}
    </button>
  );
}

function createFileTreeNode(onFileClick: (path: string) => void) {
  return function FileTreeNode({ node, style }: NodeRendererProps<FileTreeData>) {
    if (node.data.isSection) return <LocalSectionNode node={node} style={style} />;

    const isFolder = node.data.children !== undefined && !node.data.isSection;
    if (isFolder) return <LocalFolderNode node={node} style={style} />;

    return <LocalFileNode node={node} style={style} onFileClick={onFileClick} />;
  };
}

export function LocalChangesViewer({ changeSnapshot, isLoading, taskId }: LocalChangesViewerProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getDiffViewModePreference);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const treeRef = useRef<TreeApi<FileTreeData>>(null);
  const { identity } = useGitHubAuth();

  const comments = useTaskComments(taskId);
  const localComments = useMemo(() => {
    const allComments = Object.values(comments ?? {});
    return allComments.filter(
      (c): c is LocalComment => c && typeof c === 'object' && 'kind' in c && c.kind === 'local'
    );
  }, [comments]);

  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
    setDiffViewModePreference(mode);
  }, []);

  const handleExpandSidebar = useCallback(() => setSidebarCollapsed(false), []);

  const fileTree = useMemo(
    () => (changeSnapshot ? buildGroupedFileTree(changeSnapshot) : []),
    [changeSnapshot]
  );

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

  const NodeRenderer = useMemo(() => createFileTreeNode(setSelectedFile), [setSelectedFile]);

  useEffect(() => {
    if (changeSnapshot && changeSnapshot.files.length > 0 && selectedFile === null) {
      const firstFile = changeSnapshot.files[0];
      if (firstFile) {
        setSelectedFile(firstFile.path);
      }
    }
  }, [changeSnapshot, selectedFile]);

  const selectedFileData = changeSnapshot?.files.find((f) => f.path === selectedFile);

  const commentSupport = useMemo((): CommentSupport | undefined => {
    return {
      type: 'local',
      comments: localComments,
      taskId,
      currentUser: identity?.username,
      currentHeadSha: changeSnapshot?.headSha,
      machineId: changeSnapshot?.machineId,
    };
  }, [localComments, taskId, identity?.username, changeSnapshot]);

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

  if (!changeSnapshot) {
    return (
      <Alert status="default">
        <Alert.Content>
          <Alert.Title>No Changes Available</Alert.Title>
          <Alert.Description>No local changes have been synced for this task.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (changeSnapshot.files.length === 0) {
    return (
      <Card>
        <Card.Content className="p-8 text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Local Changes</h3>
          <p className="text-muted-foreground">
            Working directory is clean on branch{' '}
            <code className="text-xs">{changeSnapshot.branch}</code>
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-2 px-3 py-2 bg-surface/50 border border-separator rounded-lg">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <code className="font-mono truncate">{changeSnapshot.cwd}</code>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-2 flex-1 min-h-0 ${sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[300px_1fr]'}`}
      >
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

        <div className="flex flex-col h-full min-h-0 overflow-y-auto">
          {selectedFile && selectedFileData ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <FileDiffView
                filename={selectedFile}
                patch={selectedFileData.patch}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                sidebarCollapsed={sidebarCollapsed}
                onExpandSidebar={handleExpandSidebar}
                commentSupport={commentSupport}
              />
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
