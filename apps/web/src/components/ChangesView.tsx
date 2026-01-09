import { Alert, Avatar, Button, Card, Chip, Link as HeroLink, TextArea } from '@heroui/react';
import {
  addPRReviewComment,
  type LinkedPR,
  type PlanMetadata,
  type PRReviewComment,
  removePRReviewComment,
  resolvePRReviewComment,
} from '@peer-plan/schema';
import {
  Check,
  CheckCircle,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useLinkedPRs } from '@/hooks/useLinkedPRs';
import { getCommentsForFile, usePRReviewComments } from '@/hooks/usePRReviewComments';

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

          {/* Diff Viewer with Comments */}
          <DiffViewer pr={selected} planId={metadata.id} repo={metadata.repo || ''} ydoc={ydoc} />
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
  ydoc: Y.Doc;
}

function DiffViewer({ pr, planId, repo, ydoc }: DiffViewerProps) {
  const [files, setFiles] = useState<PRFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get all comments for this PR
  const comments = usePRReviewComments(ydoc, pr.prNumber);

  // Count comments per file
  const commentCountByFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of comments) {
      const current = counts.get(comment.path) ?? 0;
      counts.set(comment.path, current + 1);
    }
    return counts;
  }, [comments]);

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
                commentCount={commentCountByFile.get(file.filename) ?? 0}
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
          prNumber={pr.prNumber}
          ydoc={ydoc}
          comments={getCommentsForFile(comments, selectedFile)}
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
  commentCount: number;
}

function FileListItem({ file, selected, onSelect, commentCount }: FileListItemProps) {
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
          {commentCount > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="w-3 h-3" />
              {commentCount}
            </span>
          )}
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
  prNumber: number;
  ydoc: Y.Doc;
  comments: PRReviewComment[];
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

function FileDiffView({ filename, patch, prNumber, ydoc, comments }: FileDiffViewProps) {
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

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between">
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
          <table className="w-full text-sm font-mono border-collapse">
            <tbody>
              {diffLines.map((line) => {
                const lineComments =
                  line.newLineNumber !== null ? (commentsByLine.get(line.newLineNumber) ?? []) : [];
                const isCommenting = commentingLine === line.newLineNumber;
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
    hunk: 'bg-primary/5',
    meta: 'bg-muted/50',
  }[line.type];

  const textClass = {
    add: 'text-success-400',
    remove: 'text-danger',
    context: 'text-foreground',
    hunk: 'text-primary font-semibold',
    meta: 'text-muted-foreground',
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
