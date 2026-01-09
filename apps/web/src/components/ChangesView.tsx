import { Alert, Card, Chip, Link as HeroLink } from '@heroui/react';
import type { LinkedPR, PlanMetadata } from '@peer-plan/schema';
import { ExternalLink, GitBranch, GitPullRequest } from 'lucide-react';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { useLinkedPRs } from '@/hooks/useLinkedPRs';

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
        <Alert status="default">
          <Alert.Content>
            <Alert.Title>No PRs Linked</Alert.Title>
            <Alert.Description>
              PRs are auto-linked when you run <code className="text-xs">complete_task</code>.
              <br />
              <br />
              Create a PR first, then complete the task to see changes here.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </div>
    );
  }

  const selected = linkedPRs.find((pr) => pr.prNumber === selectedPR) ?? linkedPRs[0] ?? null;

  return (
    <div className="max-w-full mx-auto p-4 md:p-6 space-y-4">
      {/* PR List (when multiple PRs) */}
      {linkedPRs.length > 1 && (
        <div className="space-y-2">
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
        <div className="space-y-4">
          {/* PR Header */}
          <PRHeader pr={selected} repo={metadata.repo} />

          {/* Diff Viewer */}
          <DiffViewer pr={selected} planId={metadata.id} repo={metadata.repo || ''} />
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
}

function PRHeader({ pr, repo }: PRHeaderProps) {
  return (
    <Card>
      <Card.Content className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">PR #{pr.prNumber}</h3>
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
            </div>
            {pr.title && <p className="text-foreground mb-2">{pr.title}</p>}
            {pr.branch && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <GitBranch className="w-4 h-4" />
                <code className="text-xs">{pr.branch}</code>
              </div>
            )}
          </div>
          {repo && (
            <HeroLink
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View on GitHub
            </HeroLink>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

interface DiffViewerProps {
  pr: LinkedPR;
  planId: string;
  repo: string;
}

function DiffViewer({ pr, planId, repo }: DiffViewerProps) {
  const [files, setFiles] = useState<PRFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch file list
  useEffect(() => {
    if (!repo) return;

    setLoading(true);
    setError(null);

    // Find registry port (assuming localhost:32191 or 32192)
    fetch(`http://localhost:32191/api/plan/${planId}/pr-files/${pr.prNumber}`)
      .then((res) => {
        if (!res.ok) {
          // Try second port if first fails
          return fetch(`http://localhost:32192/api/plan/${planId}/pr-files/${pr.prNumber}`);
        }
        return res;
      })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { files: PRFile[] }) => {
        setFiles(data.files);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [pr.prNumber, planId, repo]);

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
    <div className="space-y-4">
      {/* File Tree */}
      <Card>
        <Card.Header>
          <Card.Title>Files Changed ({files.length})</Card.Title>
        </Card.Header>
        <Card.Content className="p-0">
          <div className="max-h-96 overflow-y-auto">
            {files.map((file) => (
              <FileListItem
                key={file.filename}
                file={file}
                selected={file.filename === selectedFile}
                onSelect={() => setSelectedFile(file.filename)}
              />
            ))}
          </div>
        </Card.Content>
      </Card>

      {/* Diff View for Selected File */}
      {selectedFile && (
        <FileDiffView
          filename={selectedFile}
          patch={files.find((f) => f.filename === selectedFile)?.patch}
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

interface FileListItemProps {
  file: PRFile;
  selected: boolean;
  onSelect: () => void;
}

function FileListItem({ file, selected, onSelect }: FileListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-3 border-b border-separator text-left transition-colors hover:bg-muted/50 ${
        selected ? 'bg-primary/5' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <code className="text-sm font-mono truncate">{file.filename}</code>
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="text-success-400">+{file.additions}</span>
          <span className="text-danger">-{file.deletions}</span>
        </div>
      </div>
    </button>
  );
}

interface FileDiffViewProps {
  filename: string;
  patch?: string;
}

function FileDiffView({ filename, patch }: FileDiffViewProps) {
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

  const lines = patch.split('\n');

  return (
    <Card>
      <Card.Header>
        <Card.Title className="font-mono text-sm">{filename}</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        <div className="bg-muted rounded-b-lg overflow-x-auto max-h-[600px] overflow-y-auto">
          <pre className="text-sm font-mono p-4">
            {lines.map((line, i) => {
              let className = 'text-foreground';
              if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-success-400';
              else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-danger';
              else if (line.startsWith('@@')) className = 'text-primary font-semibold';
              else if (line.startsWith('diff') || line.startsWith('index'))
                className = 'text-muted-foreground';

              return (
                <div key={`${i}-${line.slice(0, 20)}`} className={className}>
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      </Card.Content>
    </Card>
  );
}
