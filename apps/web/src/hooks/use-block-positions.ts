import { useCallback, useEffect, useRef, useState } from 'react';

export interface BlockPosition {
  blockId: string;
  top: number;
  height: number;
  element: HTMLElement | null;
}

export type BlockPositionMap = Map<string, BlockPosition>;

interface UseBlockPositionsOptions {
  debounceMs?: number;
}

interface UseBlockPositionsResult {
  positions: BlockPositionMap;
  recalculate: () => void;
  isReady: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function getBlockIdFromElement(element: HTMLElement): string | null {
  return element.getAttribute('data-block-id');
}

function findBlockElements(container: HTMLElement): HTMLElement[] {
  const blocks = container.querySelectorAll<HTMLElement>('[data-block-id]');
  return Array.from(blocks);
}

export function useBlockPositions(options: UseBlockPositionsOptions = {}): UseBlockPositionsResult {
  const { debounceMs = 100 } = options;

  const [positions, setPositions] = useState<BlockPositionMap>(new Map());
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<number | null>(null);

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

  const recalculate = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = window.setTimeout(() => {
      calculatePositions();
      debounceTimeoutRef.current = null;
    }, debounceMs);
  }, [calculatePositions, debounceMs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    calculatePositions();

    const mutationObserver = new MutationObserver(() => {
      recalculate();
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-block-id', 'style'],
    });

    const handleScroll = () => recalculate();
    container.addEventListener('scroll', handleScroll, { passive: true });

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

export function getBlockPosition(
  positions: BlockPositionMap,
  blockId: string
): BlockPosition | undefined {
  return positions.get(blockId);
}

export function findBlockAtPosition(positions: BlockPositionMap, y: number): string | null {
  for (const [blockId, position] of positions) {
    if (y >= position.top && y < position.top + position.height) {
      return blockId;
    }
  }
  return null;
}
