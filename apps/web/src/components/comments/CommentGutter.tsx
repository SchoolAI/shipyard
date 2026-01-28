/**
 * Comment gutter component - side panel for displaying comment threads.
 *
 * This is the main container for the Notion-style side comments.
 * It renders thread cards positioned at the Y-coordinates of their anchor blocks.
 *
 * Desktop Only (for now):
 * - Fixed-position sidebar on the right
 * - Threads positioned at block Y-coordinates
 * - Handles overlapping threads by stacking
 * - Dynamic repositioning when threads expand/collapse
 *
 * Mobile support is designed for but not implemented in this phase.
 */

import type { Thread } from '@shipyard/schema';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { BlockPositionMap } from '@/hooks/useBlockPositions';
import { type AnchoredThread, useThreads } from '@/hooks/useThreads';
import { ThreadCard } from './ThreadCard';
import { ThreadComposer } from './ThreadComposer';

/**
 * Type guard to check if a thread has an anchorBlockId field.
 */
function hasAnchorBlockId(thread: Thread): thread is AnchoredThread {
  return 'anchorBlockId' in thread && typeof thread.anchorBlockId === 'string';
}

/**
 * Type guard to check if an element is an HTMLDivElement with our data attributes.
 */
function isThreadCardElement(element: Element): element is HTMLDivElement {
  return element instanceof HTMLDivElement && 'threadId' in element.dataset;
}

/** Minimum gap between stacked thread cards */
const MIN_THREAD_GAP = 8;

/** Fallback height for cards that haven't been measured yet */
const DEFAULT_CARD_HEIGHT = 100;

interface PositionedThread {
  thread: Thread;
  blockId: string | null;
  targetY: number;
  adjustedY: number;
}

/** Map of thread IDs to their measured heights */
type ThreadHeightMap = Map<string, number>;

/** Data for opening the composer from external sources (e.g., toolbar button) */
export interface OpenComposerData {
  blockId: string;
  selectedText?: string;
}

interface CommentGutterProps {
  /** The Y.Doc containing threads */
  ydoc: Y.Doc;
  /** Map of block IDs to their positions */
  blockPositions: BlockPositionMap;
  /** Whether the gutter is visible */
  isVisible?: boolean;
  /** Current user ID for identity */
  userId: string | null;
  /** Current user display name */
  userName?: string;
  /** Callback to scroll editor to a block */
  onScrollToBlock?: (blockId: string) => void;
  /** Width of the gutter */
  width?: number;
  /** External request to open composer (from toolbar button) */
  openComposerRequest?: OpenComposerData | null;
  /** Callback when composer state changes (so parent can clear the request) */
  onComposerStateChange?: (isOpen: boolean) => void;
}

/**
 * Calculate adjusted Y positions to prevent overlap.
 * Threads that would overlap are pushed down.
 * Uses actual measured heights when available.
 */
function calculateAdjustedPositions(
  threads: Thread[],
  blockPositions: BlockPositionMap,
  threadHeights: ThreadHeightMap
): PositionedThread[] {
  const positioned: PositionedThread[] = [];

  /** Sort threads by their target Y position */
  const threadsWithPositions = threads
    .map((thread) => {
      const blockId = hasAnchorBlockId(thread) ? thread.anchorBlockId : null;
      const position = blockId ? blockPositions.get(blockId) : null;
      const targetY = position ? position.top : 0;

      return { thread, blockId, targetY };
    })
    .filter((t) => t.targetY > 0 || t.blockId === null)
    .sort((a, b) => a.targetY - b.targetY);

  /** Calculate adjusted positions to prevent overlap */
  let lastBottom = 0;

  for (const { thread, blockId, targetY } of threadsWithPositions) {
    const adjustedY = Math.max(targetY, lastBottom + MIN_THREAD_GAP);
    positioned.push({ thread, blockId, targetY, adjustedY });
    /** Use measured height if available, otherwise fall back to default */
    const cardHeight = threadHeights.get(thread.id) ?? DEFAULT_CARD_HEIGHT;
    lastBottom = adjustedY + cardHeight;
  }

  return positioned;
}

/**
 * Comment gutter for desktop - renders alongside the editor.
 */
export function CommentGutter({
  ydoc,
  blockPositions,
  isVisible = true,
  userId,
  onScrollToBlock,
  width = 320,
  openComposerRequest,
  onComposerStateChange,
}: CommentGutterProps) {
  /** Include resolved threads so they're always visible */
  const { threads, addReply, createThread, toggleResolved, deleteThread } = useThreads(ydoc, {
    includeResolved: true,
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composerBlockId, setComposerBlockId] = useState<string | null>(null);
  const [composerY, setComposerY] = useState<number>(0);
  const [composerSelectedText, setComposerSelectedText] = useState<string | undefined>(undefined);
  const gutterRef = useRef<HTMLDivElement>(null);

  /** Track measured heights of thread cards */
  const [threadHeights, setThreadHeights] = useState<ThreadHeightMap>(new Map());

  /** Persistent ResizeObserver instance - created once on mount */
  const observerRef = useRef<ResizeObserver | null>(null);

  /** Track which elements are currently being observed */
  const observedElementsRef = useRef<WeakSet<HTMLDivElement>>(new WeakSet());

  /**
   * Create a persistent ResizeObserver on mount.
   * This observer tracks height changes of thread card elements
   * and updates the threadHeights state to trigger position recalculation.
   */
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
            /** Only update if height actually changed to avoid unnecessary re-renders */
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

  /**
   * Handle external request to open composer (from toolbar button).
   * When a new request comes in, open the composer at the specified block.
   */
  useEffect(() => {
    if (openComposerRequest && userId) {
      const { blockId, selectedText } = openComposerRequest;

      /** Get the Y position of the block */
      const position = blockPositions.get(blockId);
      const targetY = position ? position.top : 0;

      setComposerBlockId(blockId);
      setComposerY(targetY);
      setComposerSelectedText(selectedText);
      setActiveThreadId(null);
    }
  }, [openComposerRequest, blockPositions, userId]);

  /**
   * Notify parent when composer state changes.
   */
  useEffect(() => {
    onComposerStateChange?.(composerBlockId !== null);
  }, [composerBlockId, onComposerStateChange]);

  /**
   * Ref callback to attach ResizeObserver to thread card elements.
   * Each element is observed when mounted. WeakSet prevents double-observing.
   * Returns a new callback per threadId to maintain stable refs across re-renders.
   */
  const createThreadCardRefCallback = useCallback(
    (_threadId: string) => (el: HTMLDivElement | null) => {
      if (el && observerRef.current && !observedElementsRef.current.has(el)) {
        observerRef.current.observe(el);
        observedElementsRef.current.add(el);
      }
    },
    []
  );

  /** Calculate positioned threads using measured heights */
  const positionedThreads = useMemo(
    () => calculateAdjustedPositions(threads, blockPositions, threadHeights),
    [threads, blockPositions, threadHeights]
  );

  /** Handle thread click */
  const handleThreadClick = useCallback((threadId: string) => {
    setActiveThreadId((prev) => (prev === threadId ? null : threadId));
    setComposerBlockId(null);
  }, []);

  /** Handle scroll to block */
  const handleScrollToBlock = useCallback(
    (blockId: string | null) => {
      if (blockId && onScrollToBlock) {
        onScrollToBlock(blockId);
      }
    },
    [onScrollToBlock]
  );

  /** Handle reply to thread */
  const handleReply = useCallback(
    (threadId: string, body: string) => {
      if (!userId) return;
      addReply(threadId, body, userId);
    },
    [addReply, userId]
  );

  /** Handle toggle resolved */
  const handleToggleResolved = useCallback(
    (threadId: string) => {
      toggleResolved(threadId);
    },
    [toggleResolved]
  );

  /** Handle delete thread */
  const handleDeleteThread = useCallback(
    (threadId: string) => {
      deleteThread(threadId);
      /** Clear active thread if it was deleted */
      setActiveThreadId((prev) => (prev === threadId ? null : prev));
    },
    [deleteThread]
  );

  /** Handle create new thread */
  const handleCreateThread = useCallback(
    (blockId: string, body: string) => {
      if (!userId) return;
      createThread(blockId, body, userId, composerSelectedText);
      setComposerBlockId(null);
      setComposerSelectedText(undefined);
    },
    [createThread, userId, composerSelectedText]
  );

  /** Close composer */
  const closeComposer = useCallback(() => {
    setComposerBlockId(null);
    setComposerSelectedText(undefined);
  }, []);

  /** Close active thread when clicking outside */
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
      {/* Sticky container for threads */}
      <div className="sticky top-0 h-screen overflow-y-auto py-4 px-2">
        {/* Empty state */}
        {!hasThreads && !showComposer && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs mt-1">Select text to add a comment</p>
          </div>
        )}

        {/* Thread cards */}
        <div className="relative" style={{ minHeight: hasThreads ? 200 : 0 }}>
          {positionedThreads.map(({ thread, blockId, adjustedY }) => (
            <div
              key={thread.id}
              ref={createThreadCardRefCallback(thread.id)}
              data-thread-id={thread.id}
              className="absolute left-0 right-0 transition-all duration-200 ease-out"
              style={{ top: adjustedY }}
            >
              <ThreadCard
                thread={thread}
                isActive={activeThreadId === thread.id}
                onClick={() => handleThreadClick(thread.id)}
                onScrollToBlock={blockId ? () => handleScrollToBlock(blockId) : undefined}
                onReply={userId ? (body) => handleReply(thread.id, body) : undefined}
                onToggleResolved={() => handleToggleResolved(thread.id)}
                onDelete={() => handleDeleteThread(thread.id)}
                currentUserId={userId ?? undefined}
                canReply={userId !== null}
              />
            </div>
          ))}

          {/* Composer */}
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

/**
 * Props for the CommentGutterContext.
 * Allows child components to open the composer for a specific block.
 */
export interface CommentGutterContextValue {
  openComposer: (blockId: string) => void;
  hasIdentity: boolean;
}
