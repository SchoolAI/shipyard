/**
 * Hook to track block positions in the BlockNote editor.
 * Maps block IDs to their Y-coordinates for positioning the comment gutter.
 *
 * This hook observes the editor's DOM to get the vertical positions of each block,
 * enabling the comment gutter to align comments with their associated blocks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Position data for a single block */
export interface BlockPosition {
  /** Block ID from BlockNote */
  blockId: string;
  /** Y-coordinate relative to the editor container */
  top: number;
  /** Height of the block element */
  height: number;
  /** Reference to the DOM element (may be null if block was removed) */
  element: HTMLElement | null;
}

/** Map of block IDs to their positions */
export type BlockPositionMap = Map<string, BlockPosition>;

interface UseBlockPositionsOptions {
  /** CSS selector for the editor container */
  editorSelector?: string;
  /** Debounce delay for recalculating positions (ms) */
  debounceMs?: number;
}

interface UseBlockPositionsResult {
  /** Map of block IDs to their positions */
  positions: BlockPositionMap;
  /** Recalculate all block positions */
  recalculate: () => void;
  /** Whether positions have been calculated at least once */
  isReady: boolean;
  /** Reference to attach to the editor container for position calculations */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Get the block ID from a BlockNote block element.
 * BlockNote uses data-block-id attribute on block elements.
 */
function getBlockIdFromElement(element: HTMLElement): string | null {
  return element.getAttribute('data-block-id');
}

/**
 * Find all block elements in the editor container.
 */
function findBlockElements(container: HTMLElement): HTMLElement[] {
  const blocks = container.querySelectorAll<HTMLElement>('[data-block-id]');
  return Array.from(blocks);
}

/**
 * Hook to track block positions for the comment gutter.
 */
export function useBlockPositions(options: UseBlockPositionsOptions = {}): UseBlockPositionsResult {
  const { debounceMs = 100 } = options;

  const [positions, setPositions] = useState<BlockPositionMap>(new Map());
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<number | null>(null);

  /**
   * Calculate positions for all blocks in the editor.
   * Positions are relative to the container element.
   */
  const calculatePositions = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const blockElements = findBlockElements(container);
    const containerRect = container.getBoundingClientRect();
    const newPositions = new Map<string, BlockPosition>();

    for (const element of blockElements) {
      const blockId = getBlockIdFromElement(element);
      if (!blockId) continue;

      const rect = element.getBoundingClientRect();
      newPositions.set(blockId, {
        blockId,
        top: rect.top - containerRect.top + container.scrollTop,
        height: rect.height,
        element,
      });
    }

    setPositions(newPositions);
    if (!isReady) setIsReady(true);
  }, [isReady]);

  /**
   * Debounced recalculate function.
   */
  const recalculate = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = window.setTimeout(() => {
      calculatePositions();
      debounceTimeoutRef.current = null;
    }, debounceMs);
  }, [calculatePositions, debounceMs]);

  /**
   * Set up observers for DOM changes and scroll events.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /** Initial calculation */
    calculatePositions();

    /** Observe DOM mutations (content changes) */
    const mutationObserver = new MutationObserver(() => {
      recalculate();
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-block-id', 'style'],
    });

    /** Listen for scroll events on the container */
    const handleScroll = () => recalculate();
    container.addEventListener('scroll', handleScroll, { passive: true });

    /** Listen for window resize */
    const handleResize = () => recalculate();
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      mutationObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (debounceTimeoutRef.current !== null) {
        window.clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [calculatePositions, recalculate]);

  return {
    positions,
    recalculate,
    isReady,
    containerRef,
  };
}

/**
 * Get the Y-position for a specific block.
 */
export function getBlockPosition(
  positions: BlockPositionMap,
  blockId: string
): BlockPosition | undefined {
  return positions.get(blockId);
}

/**
 * Find the block ID at a specific Y-coordinate.
 * Useful for determining which block a user clicked on.
 */
export function findBlockAtPosition(positions: BlockPositionMap, y: number): string | null {
  for (const [blockId, position] of positions) {
    if (y >= position.top && y < position.top + position.height) {
      return blockId;
    }
  }
  return null;
}
