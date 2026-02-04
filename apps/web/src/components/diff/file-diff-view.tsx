import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view-pure.css';
import { Alert, Button, ButtonGroup, Card } from '@heroui/react';
import { ChevronRight, Columns2, Rows3 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddDiffCommentForm } from './add-diff-comment-form';
import { DiffCommentThread } from './diff-comment-thread';
import type { CommentSupport, DiffComment, DiffViewMode } from './types';

export type { CommentSupport, DiffComment, DiffViewMode } from './types';

function parsePatchToLineContentMap(patch: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = patch.split('\n');
  let newLineNumber = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNumber = Number.parseInt(hunkMatch[1] ?? '1', 10);
      continue;
    }

    if (newLineNumber === 0) continue;

    const isAddition = line.startsWith('+') && !line.startsWith('+++');
    const isDeletion = line.startsWith('-') && !line.startsWith('---');
    const isNoNewline = line.startsWith('\\');

    if (isAddition) {
      map.set(newLineNumber, line.slice(1));
      newLineNumber++;
    } else if (!isDeletion && !isNoNewline) {
      map.set(newLineNumber, line.slice(1));
      newLineNumber++;
    }
  }
  return map;
}

export interface FileDiffViewProps {
  filename: string;
  patch?: string;
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  commentSupport?: CommentSupport;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

function arePrimitivePropsEqual(prev: FileDiffViewProps, next: FileDiffViewProps): boolean {
  return (
    prev.filename === next.filename &&
    prev.patch === next.patch &&
    prev.viewMode === next.viewMode &&
    prev.sidebarCollapsed === next.sidebarCollapsed &&
    prev.onViewModeChange === next.onViewModeChange &&
    prev.onExpandSidebar === next.onExpandSidebar
  );
}

function areCommentSupportFieldsEqual(prevCS: CommentSupport, nextCS: CommentSupport): boolean {
  return (
    prevCS.type === nextCS.type &&
    prevCS.prNumber === nextCS.prNumber &&
    prevCS.taskId === nextCS.taskId &&
    prevCS.currentUser === nextCS.currentUser &&
    prevCS.currentHeadSha === nextCS.currentHeadSha &&
    prevCS.machineId === nextCS.machineId
  );
}

function areCommentListsEqual(prev: DiffComment[], next: DiffComment[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((comment, i) => comment.id === next[i]?.id);
}

function arePropsEqual(prev: FileDiffViewProps, next: FileDiffViewProps): boolean {
  if (prev === next) return true;
  if (!arePrimitivePropsEqual(prev, next)) return false;

  const prevCS = prev.commentSupport;
  const nextCS = next.commentSupport;

  if (!prevCS && !nextCS) return true;
  if (!prevCS || !nextCS) return false;

  return (
    areCommentSupportFieldsEqual(prevCS, nextCS) &&
    areCommentListsEqual(prevCS.comments, nextCS.comments)
  );
}

export const FileDiffView = memo(function FileDiffView({
  filename,
  patch,
  viewMode,
  onViewModeChange,
  commentSupport,
  sidebarCollapsed,
  onExpandSidebar,
}: FileDiffViewProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };
    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const comments = commentSupport?.comments;
  const taskId = commentSupport?.taskId;
  const commentType = commentSupport?.type;
  const prNumber = commentSupport?.prNumber;
  const currentUser = commentSupport?.currentUser;
  const currentHeadSha = commentSupport?.currentHeadSha;
  const machineId = commentSupport?.machineId;

  const lineContentMap = useMemo(() => {
    if (!patch) return new Map<number, string>();
    return parsePatchToLineContentMap(patch);
  }, [patch]);

  const callbackDepsRef = useRef({
    taskId,
    commentType,
    prNumber,
    currentHeadSha,
    currentUser,
    filename,
    lineContentMap,
    machineId,
  });
  callbackDepsRef.current = {
    taskId,
    commentType,
    prNumber,
    currentHeadSha,
    currentUser,
    filename,
    lineContentMap,
    machineId,
  };

  const extendData = useMemo(() => {
    if (!comments) return undefined;

    const fileComments = comments.filter((c) => c.path === filename);
    const newFile: Record<string, { data: DiffComment[] }> = {};

    for (const comment of fileComments) {
      const key = String(comment.line);
      const existing = newFile[key];
      if (existing) {
        existing.data.push(comment);
      } else {
        newFile[key] = { data: [comment] };
      }
    }

    for (const entry of Object.values(newFile)) {
      entry.data.sort((a, b) => a.createdAt - b.createdAt);
    }

    return { newFile };
  }, [comments, filename]);

  const renderExtendLine = useCallback(({ data }: { data: DiffComment[] }) => {
    const {
      taskId: id,
      currentUser: user,
      currentHeadSha: sha,
      lineContentMap: contentMap,
    } = callbackDepsRef.current;
    if (!id) return null;
    return (
      <DiffCommentThread
        comments={data}
        taskId={id}
        currentUser={user}
        currentHeadSha={sha}
        lineContentMap={contentMap}
      />
    );
  }, []);

  const renderWidgetLine = useCallback(
    ({ lineNumber, onClose }: { lineNumber: number; onClose: () => void }) => {
      const {
        taskId: id,
        commentType: type,
        prNumber: pr,
        currentHeadSha: sha,
        filename: path,
        lineContentMap: contentMap,
        machineId: machine,
      } = callbackDepsRef.current;
      if (!id || !type) return null;
      return (
        <AddDiffCommentForm
          commentType={type}
          prNumber={pr}
          currentHeadSha={sha}
          path={path}
          line={lineNumber}
          lineContent={contentMap.get(lineNumber)}
          taskId={id}
          onClose={onClose}
          machineId={machine}
        />
      );
    },
    []
  );

  if (!patch) {
    return (
      <Alert status="warning">
        <Alert.Content>
          <Alert.Title>No Diff Available</Alert.Title>
          <Alert.Description>
            The diff for <code>{filename}</code> is not available (binary file, too large, or no
            content changes).
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const fileLang = filename.split('.').pop() || 'text';

  const fullDiff = `diff --git a/${filename} b/${filename}
--- a/${filename}
+++ b/${filename}
${patch}`;

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {sidebarCollapsed && onExpandSidebar && (
            <button
              type="button"
              onClick={onExpandSidebar}
              className="p-1 hover:bg-surface-hover rounded transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          <Card.Title className="font-mono text-sm">{filename}</Card.Title>
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
          diffViewAddWidget={!!commentSupport}
          extendData={extendData}
          onAddWidgetClick={(_side, _line) => {}}
          renderExtendLine={commentSupport ? renderExtendLine : undefined}
          renderWidgetLine={commentSupport ? renderWidgetLine : undefined}
        />
      </Card.Content>
    </Card>
  );
}, arePropsEqual);
