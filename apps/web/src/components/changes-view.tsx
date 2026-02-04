import { Alert, Card, Chip } from '@heroui/react';
import type { TaskId, TaskMeta } from '@shipyard/loro-schema';
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
import { INTERVALS } from '@/constants/timings';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import {
  useTaskChangeSnapshots,
  useTaskComments,
  useTaskLinkedPRs,
} from '@/loro/selectors/task-selectors';
import {
  type ChangeSnapshot,
  type ChangesViewState,
  isChangeSnapshot,
  isLinkedPR,
  type LinkedPR,
} from './changes-types';
import { type CommentSupport, type DiffViewMode, FileDiffView } from './diff';
import { LocalChangesViewer } from './local-changes-viewer';

export type {
  ChangeSource,
  ChangesViewState,
  MachinePickerState,
} from './changes-types';

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

interface ChangesViewProps {
  taskId: TaskId;
  meta: TaskMeta;
  isActive?: boolean;
  onChangesViewState?: (state: ChangesViewState) => void;
}

export function ChangesView({
  taskId,
  meta,
  isActive = true,
  onChangesViewState,
}: ChangesViewProps) {
  const linkedPRsData = useTaskLinkedPRs(taskId);
  const changeSnapshotsData = useTaskChangeSnapshots(taskId);
  const [selectedPRNumber, setSelectedPRNumber] = useState<number | null>(null);

  const [source, setSource] = useState<'local' | 'pr'>('local');
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);

  const [prRefetchTrigger, setPRRefetchTrigger] = useState(0);

  const linkedPRsList = useMemo((): LinkedPR[] => {
    if (!linkedPRsData || !Array.isArray(linkedPRsData)) return [];
    return linkedPRsData.filter(isLinkedPR);
  }, [linkedPRsData]);

  const snapshotsRecord = useMemo((): Record<string, ChangeSnapshot> => {
    if (!changeSnapshotsData || typeof changeSnapshotsData !== 'object') return {};
    const result: Record<string, ChangeSnapshot> = {};
    for (const [key, value] of Object.entries(changeSnapshotsData)) {
      if (isChangeSnapshot(value)) {
        result[key] = value;
      }
    }
    return result;
  }, [changeSnapshotsData]);

  const selected =
    linkedPRsList.find((pr) => pr.prNumber === selectedPRNumber) ?? linkedPRsList[0] ?? null;
  const hasPRs = linkedPRsList.length > 0;

  const hasRemoteSnapshots = Object.keys(snapshotsRecord).length > 0;
  const shouldShowMachinePicker = Object.keys(snapshotsRecord).length > 1;
  const selectedSnapshot = selectedMachine
    ? snapshotsRecord[selectedMachine]
    : Object.values(snapshotsRecord)[0];

  useEffect(() => {
    if (onChangesViewState) {
      onChangesViewState({
        source,
        setSource,
        selectedPR: selected,
        hasPRs,
        machinePicker: {
          snapshots: snapshotsRecord,
          localMachineId: null,
          selectedMachineId: selectedMachine,
          onSelectMachine: setSelectedMachine,
          shouldShow: shouldShowMachinePicker,
        },
      });
    }
  }, [
    onChangesViewState,
    source,
    selected,
    hasPRs,
    snapshotsRecord,
    selectedMachine,
    shouldShowMachinePicker,
  ]);

  useEffect(() => {
    if (linkedPRsList.length > 0 && selectedPRNumber === null) {
      const firstPR = linkedPRsList[0];
      if (firstPR) {
        setSelectedPRNumber(firstPR.prNumber);
      }
    }
  }, [linkedPRsList, selectedPRNumber]);

  useEffect(() => {
    if (source !== 'pr' || !isActive) return;

    const interval = setInterval(() => {
      setPRRefetchTrigger((prev) => prev + 1);
    }, INTERVALS.PR_POLL);

    return () => clearInterval(interval);
  }, [source, isActive]);

  const workingDirectory = selectedSnapshot?.cwd;

  return (
    <div className="max-w-full mx-auto p-2 md:p-4 h-full flex flex-col">
      {workingDirectory && source === 'local' && (
        <div className="mb-2 px-3 py-2 bg-surface/50 border border-separator rounded-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <code className="font-mono truncate">{workingDirectory}</code>
          </div>
        </div>
      )}

      {source === 'local' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {hasRemoteSnapshots && selectedSnapshot ? (
            <LocalChangesViewer
              changeSnapshot={selectedSnapshot}
              isLoading={false}
              taskId={taskId}
            />
          ) : (
            <Alert status="default">
              <Alert.Content>
                <Alert.Title>No Local Changes</Alert.Title>
                <Alert.Description>
                  No change snapshots have been synced for this task.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </div>
      ) : (
        <>
          {linkedPRsList.length > 1 && (
            <div className="space-y-1.5 mb-2">
              {linkedPRsList.map((pr) => (
                <PRCard
                  key={pr.prNumber}
                  pr={pr}
                  selected={pr.prNumber === selectedPRNumber}
                  onSelect={() => setSelectedPRNumber(pr.prNumber)}
                />
              ))}
            </div>
          )}

          {selected && meta.repo && (
            <DiffViewer
              pr={selected}
              repo={meta.repo}
              taskId={taskId}
              refetchTrigger={prRefetchTrigger}
            />
          )}
        </>
      )}
    </div>
  );
}

interface PRCardProps {
  pr: LinkedPR;
  selected: boolean;
  onSelect: () => void;
}

function PRCard({ pr, selected, onSelect }: PRCardProps) {
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
        return 'default';
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

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface FileTreeData {
  id: string;
  name: string;
  children?: FileTreeData[];
  file?: PRFile;
}

interface DiffViewerProps {
  pr: LinkedPR;
  repo: string;
  taskId: TaskId;
  refetchTrigger?: number;
}

function DiffViewer({ pr, repo, taskId, refetchTrigger = 0 }: DiffViewerProps) {
  const [files, setFiles] = useState<PRFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getDiffViewModePreference);
  const { identity } = useGitHubAuth();

  const commentsData = useTaskComments(taskId);
  const prComments = useMemo(() => {
    if (!commentsData || typeof commentsData !== 'object') return [];
    const allComments = Object.values(commentsData);
    return allComments.filter(
      (
        c
      ): c is {
        kind: 'pr';
        id: string;
        prNumber: number;
        path: string;
        line: number;
        body: string;
        author: string;
        createdAt: number;
        resolved: boolean;
        threadId: string;
        inReplyTo: string | null;
      } =>
        c &&
        typeof c === 'object' &&
        'kind' in c &&
        c.kind === 'pr' &&
        'prNumber' in c &&
        c.prNumber === pr.prNumber
    );
  }, [commentsData, pr.prNumber]);

  const commentSupport = useMemo(
    (): CommentSupport => ({
      type: 'pr',
      prNumber: pr.prNumber,
      comments: prComments,
      taskId,
      currentUser: identity?.username,
    }),
    [pr.prNumber, prComments, taskId, identity?.username]
  );

  const handleViewModeChange = useCallback((mode: DiffViewMode) => {
    setViewMode(mode);
    setDiffViewModePreference(mode);
  }, []);

  const commentCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of prComments) {
      const current = counts.get(comment.path) ?? 0;
      counts.set(comment.path, current + 1);
    }
    return counts;
  }, [prComments]);

  const fileTree = useMemo(() => buildFileTreeData(files), [files]);
  const treeRef = useRef<TreeApi<FileTreeData>>(null);

  const handleFileSelect = useCallback((nodes: NodeApi<FileTreeData>[]) => {
    const node = nodes[0];
    if (!node) return;

    const fileData = node.data;
    if (fileData.file) {
      setSelectedFile(fileData.file.filename);
    }
  }, []);

  const NodeRenderer = useMemo(
    () => createFileTreeNode(commentCountByFile, setSelectedFile),
    [commentCountByFile]
  );

  useEffect(() => {
    if (!repo) return;

    const abortController = new AbortController();

    setLoading(true);
    setError(null);

    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
    };
    if (identity?.token) {
      headers.Authorization = `Bearer ${identity.token}`;
    }

    fetch(`https://api.github.com/repos/${repo}/pulls/${pr.prNumber}/files`, {
      headers,
      signal: abortController.signal,
    })
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
        if (err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [pr.prNumber, repo, identity?.token, refetchTrigger]);

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

function sortFileTreeNodes(nodes: FileTreeData[]): FileTreeData[] {
  return nodes
    .sort((a, b) => {
      const aIsFolder = a.children !== undefined;
      const bIsFolder = b.children !== undefined;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortFileTreeNodes(node.children) : undefined,
    }));
}

function insertFileIntoTree(root: FileTreeData, file: PRFile): void {
  const parts = file.filename.split('/').filter(Boolean);
  let currentNode = root;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const isFile = i === parts.length - 1;
    const path = parts.slice(0, i + 1).join('/');

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

    if (!isFile) {
      currentNode = childNode;
    }
  }
}

function buildFileTreeData(files: PRFile[]): FileTreeData[] {
  const root: FileTreeData = { id: '__root__', name: '', children: [] };
  for (const file of files) {
    insertFileIntoTree(root, file);
  }
  return sortFileTreeNodes(root.children || []);
}

interface FolderNodeProps {
  node: NodeApi<FileTreeData>;
  style: React.CSSProperties;
}

function FolderNode({ node, style }: FolderNodeProps) {
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

interface FileNodeProps {
  node: NodeApi<FileTreeData>;
  style: React.CSSProperties;
  commentCount: number;
  onFileClick: (filename: string) => void;
}

function FileNode({ node, style, commentCount, onFileClick }: FileNodeProps) {
  const file = node.data.file;
  const selectedClass = node.isSelected ? 'text-primary-foreground/80' : '';

  return (
    <button
      type="button"
      style={style}
      onClick={() => {
        node.select();
        if (file) onFileClick(file.filename);
      }}
      className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm rounded transition-colors ${node.isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-surface'}`}
      title={file?.filename}
    >
      <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-xs truncate flex-1">{node.data.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {commentCount > 0 && (
          <span className={`flex items-center gap-0.5 text-xs ${selectedClass || 'text-primary'}`}>
            <MessageSquare className="w-3 h-3" />
            {commentCount}
          </span>
        )}
        {file && (
          <>
            <span className={`text-xs ${selectedClass || 'text-success'}`}>+{file.additions}</span>
            <span className={`text-xs ${selectedClass || 'text-danger'}`}>-{file.deletions}</span>
          </>
        )}
      </div>
    </button>
  );
}

function createFileTreeNode(
  commentCountByFile: Map<string, number>,
  onFileClick: (filename: string) => void
) {
  return function FileTreeNode({ node, style }: NodeRendererProps<FileTreeData>) {
    const isFolder = node.data.children !== undefined;
    if (isFolder) return <FolderNode node={node} style={style} />;

    const commentCount = node.data.file
      ? (commentCountByFile.get(node.data.file.filename) ?? 0)
      : 0;
    return (
      <FileNode node={node} style={style} commentCount={commentCount} onFileClick={onFileClick} />
    );
  };
}
