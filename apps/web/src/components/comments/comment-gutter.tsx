import { generateCommentId, generateThreadId, type TaskId } from '@shipyard/loro-schema';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockPositionMap } from '@/hooks/use-block-positions';
import { type InlineThread, useTaskInlineThreads } from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';
import { ThreadCard } from './thread-card';
import { ThreadComposer } from './thread-composer';

const MIN_THREAD_GAP = 8;
const DEFAULT_CARD_HEIGHT = 100;

interface PositionedThread {
  thread: InlineThread;
  blockId: string;
  targetY: number;
  adjustedY: number;
}

type ThreadHeightMap = Map<string, number>;

export interface OpenComposerData {
  blockId: string;
  selectedText?: string;
}

interface CommentGutterProps {
  taskId: TaskId;
  blockPositions: BlockPositionMap;
  isVisible?: boolean;
  userId: string | null;
  onScrollToBlock?: (blockId: string) => void;
  width?: number;
  openComposerRequest?: OpenComposerData | null;
  onComposerStateChange?: (isOpen: boolean) => void;
}

function isThreadCardElement(element: Element): element is HTMLDivElement {
  return element instanceof HTMLDivElement && 'threadId' in element.dataset;
}

function calculateAdjustedPositions(
  threads: InlineThread[],
  blockPositions: BlockPositionMap,
  threadHeights: ThreadHeightMap
): PositionedThread[] {
  const positioned: PositionedThread[] = [];

  const threadsWithPositions = threads
    .map((thread) => {
      const blockId = thread.blockId;
      const position = blockId ? blockPositions.get(blockId) : null;
      const targetY = position ? position.top : 0;

      return { thread, blockId, targetY };
    })
    .filter((t) => t.targetY > 0 || t.blockId === null)
    .sort((a, b) => a.targetY - b.targetY);

  let lastBottom = 0;

  for (const { thread, blockId, targetY } of threadsWithPositions) {
    const adjustedY = Math.max(targetY, lastBottom + MIN_THREAD_GAP);
    positioned.push({ thread, blockId, targetY, adjustedY });
    const cardHeight = threadHeights.get(thread.threadId) ?? DEFAULT_CARD_HEIGHT;
    lastBottom = adjustedY + cardHeight;
  }

  return positioned;
}

export function CommentGutter({
  taskId,
  blockPositions,
  isVisible = true,
  userId,
  onScrollToBlock,
  width = 320,
  openComposerRequest,
  onComposerStateChange,
}: CommentGutterProps) {
  const threads = useTaskInlineThreads(taskId);
  const taskDoc = useTaskDocument(taskId);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composerBlockId, setComposerBlockId] = useState<string | null>(null);
  const [composerY, setComposerY] = useState<number>(0);
  const [composerSelectedText, setComposerSelectedText] = useState<string | undefined>(undefined);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [threadHeights, setThreadHeights] = useState<ThreadHeightMap>(new Map());

  const observerRef = useRef<ResizeObserver | null>(null);
  const observedElementsRef = useRef<Set<HTMLDivElement>>(new Set());

  useEffect(() => {
    observerRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!isThreadCardElement(entry.target)) continue;
        const element = entry.target;
        const threadId = element.dataset.threadId;
        if (threadId) {
          const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
          setThreadHeights((prev) => {
            const current = prev.get(threadId);
            if (current === height) return prev;
            const next = new Map(prev);
            next.set(threadId, height);
            return next;
          });
        }
      }
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (openComposerRequest && userId) {
      const { blockId, selectedText } = openComposerRequest;

      const position = blockPositions.get(blockId);
      const targetY = position ? position.top : 0;

      setComposerBlockId(blockId);
      setComposerY(targetY);
      setComposerSelectedText(selectedText);
      setActiveThreadId(null);
    }
  }, [openComposerRequest, blockPositions, userId]);

  useEffect(() => {
    onComposerStateChange?.(composerBlockId !== null);
  }, [composerBlockId, onComposerStateChange]);

  const threadCardRefCallback = useCallback((el: HTMLDivElement | null) => {
    if (!observerRef.current) return;

    if (el && !observedElementsRef.current.has(el)) {
      observerRef.current.observe(el);
      observedElementsRef.current.add(el);
    } else if (!el) {
      for (const elem of observedElementsRef.current) {
        if (!document.contains(elem)) {
          observerRef.current.unobserve(elem);
          observedElementsRef.current.delete(elem);
        }
      }
    }
  }, []);

  const positionedThreads = useMemo(
    () => calculateAdjustedPositions(threads, blockPositions, threadHeights),
    [threads, blockPositions, threadHeights]
  );

  const handleThreadClick = useCallback((threadId: string) => {
    setActiveThreadId((prev) => (prev === threadId ? null : threadId));
    setComposerBlockId(null);
  }, []);

  const handleScrollToBlock = useCallback(
    (blockId: string | null) => {
      if (blockId && onScrollToBlock) {
        onScrollToBlock(blockId);
      }
    },
    [onScrollToBlock]
  );

  const handleReply = useCallback(
    (threadId: string, body: string) => {
      if (!userId) return;

      const commentId = generateCommentId();
      const thread = threads.find((t) => t.threadId === threadId);
      if (!thread) return;

      taskDoc.comments.set(commentId, {
        id: commentId,
        kind: 'inline',
        threadId,
        blockId: thread.blockId,
        selectedText: thread.selectedText,
        body,
        author: userId,
        createdAt: Date.now(),
        resolved: false,
        inReplyTo: thread.comments[thread.comments.length - 1]?.id ?? null,
      });

      taskDoc.logEvent('comment_added', userId, {
        commentId,
        threadId,
        preview: body.slice(0, 100),
      });
    },
    [taskDoc, userId, threads]
  );

  const handleToggleResolved = useCallback(
    (threadId: string) => {
      const thread = threads.find((t) => t.threadId === threadId);
      if (!thread) return;

      const newResolved = !thread.resolved;

      for (const comment of thread.comments) {
        const existing = taskDoc.comments.get(comment.id);
        if (existing) {
          taskDoc.comments.set(comment.id, {
            ...existing,
            resolved: newResolved,
          });
        }
      }

      if (userId && newResolved) {
        const firstComment = thread.comments[0];
        if (firstComment) {
          taskDoc.logEvent('comment_resolved', userId, {
            commentId: firstComment.id,
            threadId,
          });
        }
      }
    },
    [taskDoc, threads, userId]
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((t) => t.threadId === threadId);
      if (!thread) return;

      for (const comment of thread.comments) {
        taskDoc.comments.delete(comment.id);
      }

      setActiveThreadId((prev) => (prev === threadId ? null : prev));
    },
    [taskDoc, threads]
  );

  const handleCreateThread = useCallback(
    (blockId: string, body: string) => {
      if (!userId) return;

      const threadId = generateThreadId();
      const commentId = generateCommentId();

      taskDoc.comments.set(commentId, {
        id: commentId,
        kind: 'inline',
        threadId,
        blockId,
        selectedText: composerSelectedText ?? null,
        body,
        author: userId,
        createdAt: Date.now(),
        resolved: false,
        inReplyTo: null,
      });

      taskDoc.logEvent('comment_added', userId, {
        commentId,
        threadId,
        preview: body.slice(0, 100),
      });

      setComposerBlockId(null);
      setComposerSelectedText(undefined);
    },
    [taskDoc, userId, composerSelectedText]
  );

  const closeComposer = useCallback(() => {
    setComposerBlockId(null);
    setComposerSelectedText(undefined);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (gutterRef.current && e.target instanceof Node && !gutterRef.current.contains(e.target)) {
        setActiveThreadId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isVisible) return null;

  const hasThreads = positionedThreads.length > 0;
  const showComposer = composerBlockId !== null && userId !== null;

  return (
    <aside
      ref={gutterRef}
      className="relative shrink-0 hidden lg:block"
      style={{ width }}
      aria-label="Comment threads"
    >
      <div className="sticky top-0 h-screen overflow-y-auto py-4 pr-2">
        {!hasThreads && !showComposer && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs mt-1">Select text to add a comment</p>
          </div>
        )}

        <div className="relative" style={{ minHeight: hasThreads ? 200 : 0 }}>
          {positionedThreads.map(({ thread, blockId, adjustedY }) => (
            <div
              key={thread.threadId}
              ref={threadCardRefCallback}
              data-thread-id={thread.threadId}
              className="absolute left-0 right-0 transition-all duration-200 ease-out"
              style={{ top: adjustedY }}
            >
              <ThreadCard
                thread={thread}
                isActive={activeThreadId === thread.threadId}
                onClick={() => handleThreadClick(thread.threadId)}
                onScrollToBlock={blockId ? () => handleScrollToBlock(blockId) : undefined}
                onReply={userId ? (body) => handleReply(thread.threadId, body) : undefined}
                onToggleResolved={() => handleToggleResolved(thread.threadId)}
                onDelete={() => handleDeleteThread(thread.threadId)}
                currentUserId={userId ?? undefined}
                canReply={userId !== null}
              />
            </div>
          ))}

          {showComposer && (
            <div
              className="absolute left-0 right-0 z-10 transition-all duration-200"
              style={{ top: composerY }}
            >
              <ThreadComposer
                userId={userId}
                onSubmit={(body) => handleCreateThread(composerBlockId, body)}
                onCancel={closeComposer}
                selectedText={composerSelectedText}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export interface CommentGutterContextValue {
  openComposer: (blockId: string) => void;
  hasIdentity: boolean;
}
