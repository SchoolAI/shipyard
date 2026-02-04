/**
 * Hook to manage space bar peek preview functionality on Kanban cards.
 * Handles keyboard events for showing/hiding preview and tracks hovered card.
 */

import type { PlanIndexEntry } from '@shipyard/schema';
import { useCallback, useEffect, useState } from 'react';

/** Return type for the usePeekPreview hook */
export interface UsePeekPreviewReturn {
  /** Currently hovered card ID */
  hoveredCardId: string | null;
  /** Whether peek preview is active */
  isPeeking: boolean;
  /** Plan ID being peeked (may differ from hoveredCardId during transitions) */
  peekPlanId: string | null;
  /** Plan data for peek modal */
  peekPlan: PlanIndexEntry | null;
  /** Handle card hover events */
  handleCardHover: (planId: string | null) => void;
  /** Close peek preview */
  handleClosePeek: () => void;
}

/**
 * Hook for managing space bar peek preview on Kanban cards.
 * Shows a quick preview modal when user holds space while hovering a card.
 *
 * @param activePlan - Currently dragged plan (disables peek during drag)
 * @param allPlans - All plans to find peek target from
 */
export function usePeekPreview(
  activePlan: PlanIndexEntry | null,
  allPlans: PlanIndexEntry[]
): UsePeekPreviewReturn {
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const [peekPlanId, setPeekPlanId] = useState<string | null>(null);

  /** Space bar peek handlers */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      /** Only trigger if Space and hovering over a card, not during drag */
      if (e.code === 'Space' && hoveredCardId && !activePlan) {
        /** Don't trigger if typing in an input */
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        ) {
          return;
        }
        e.preventDefault();
        setIsPeeking(true);
        setPeekPlanId(hoveredCardId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPeeking) {
        setIsPeeking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hoveredCardId, isPeeking, activePlan]);

  /** Close peek when drag starts */
  useEffect(() => {
    if (activePlan) {
      setIsPeeking(false);
      setPeekPlanId(null);
    }
  }, [activePlan]);

  const handleCardHover = useCallback((planId: string | null) => {
    setHoveredCardId(planId);
  }, []);

  const handleClosePeek = useCallback(() => {
    setIsPeeking(false);
  }, []);

  const peekPlan = peekPlanId ? (allPlans.find((p) => p.id === peekPlanId) ?? null) : null;

  return {
    hoveredCardId,
    isPeeking,
    peekPlanId,
    peekPlan,
    handleCardHover,
    handleClosePeek,
  };
}
