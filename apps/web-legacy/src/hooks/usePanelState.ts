/**
 * Hook to manage slide-out panel state for Kanban board.
 * Handles panel ID, width, URL sync, and keyboard shortcuts.
 */

import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { setSidebarCollapsed } from '@/utils/uiPreferences';

/** Available panel widths */
export type PanelWidth = 'peek' | 'expanded' | 'full';

/** Type guard to validate PanelWidth values */
function isPanelWidth(value: string | null): value is PanelWidth {
  return value === 'peek' || value === 'expanded' || value === 'full';
}

/** Return type for the usePanelState hook */
export interface UsePanelStateReturn {
  /** Currently selected plan ID (null if panel closed) */
  selectedPlanId: string | null;
  /** Current panel width */
  panelWidth: PanelWidth;
  /** Open panel for a specific plan */
  handleCardClick: (planId: string) => void;
  /** Close the panel */
  handleClosePanel: () => void;
  /** Change panel width */
  handleChangeWidth: (width: PanelWidth) => void;
  /** Cycle panel width in a direction */
  cycleWidth: (direction: 'expand' | 'collapse') => void;
}

/**
 * Hook for managing the slide-out panel state on the Kanban board.
 * Syncs panel state with URL parameters and handles keyboard shortcuts.
 *
 * @param initialPanelId - Initial plan ID from URL
 * @param initialWidth - Initial width from URL
 * @param navigate - React Router navigate function
 * @param allPlans - All plans for navigation shortcuts
 * @param getPlanRoute - Function to get plan route
 */
export function usePanelState(
  initialPanelId: string | null,
  initialWidthStr: string | null,
  navigate: NavigateFunction,
  allPlans: { id: string }[],
  getPlanRoute: (planId: string) => string
): UsePanelStateReturn {
  const initialWidth: PanelWidth = isPanelWidth(initialWidthStr) ? initialWidthStr : 'peek';

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPanelId);
  const [panelWidth, setPanelWidth] = useState<PanelWidth>(initialWidth);

  /** Update URL when panel state changes */
  useEffect(() => {
    if (selectedPlanId) {
      navigate(`?panel=${selectedPlanId}&width=${panelWidth}`, {
        replace: true,
      });
    } else {
      navigate('', { replace: true });
    }
  }, [selectedPlanId, panelWidth, navigate]);

  const handleCardClick = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    setPanelWidth('peek');
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  const handleChangeWidth = useCallback((width: PanelWidth) => {
    setPanelWidth(width);
  }, []);

  /** Panel width cycling */
  const cycleWidth = useCallback(
    (direction: 'expand' | 'collapse') => {
      const widths: PanelWidth[] = ['peek', 'expanded', 'full'];
      const currentIndex = widths.indexOf(panelWidth);
      if (direction === 'expand' && currentIndex < widths.length - 1) {
        const nextWidth = widths[currentIndex + 1];
        if (nextWidth !== undefined) {
          setPanelWidth(nextWidth);
        }
      } else if (direction === 'collapse' && currentIndex > 0) {
        const prevWidth = widths[currentIndex - 1];
        if (prevWidth !== undefined) {
          setPanelWidth(prevWidth);
        }
      }
    },
    [panelWidth]
  );

  /** Keyboard shortcuts for panel */
  useKeyboardShortcuts({
    onTogglePanel: useCallback(() => {
      if (selectedPlanId) {
        cycleWidth('collapse');
      }
    }, [selectedPlanId, cycleWidth]),
    onExpandPanel: useCallback(() => {
      if (selectedPlanId) {
        cycleWidth('expand');
      }
    }, [selectedPlanId, cycleWidth]),
    onFullScreen: useCallback(() => {
      if (selectedPlanId) {
        setSidebarCollapsed(true);
        navigate(getPlanRoute(selectedPlanId));
      }
    }, [selectedPlanId, navigate, getPlanRoute]),
    onClose: handleClosePanel,
    onNextItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = allPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex < allPlans.length - 1) {
        const nextPlan = allPlans[currentIndex + 1];
        if (nextPlan) {
          setSelectedPlanId(nextPlan.id);
        }
      }
    }, [selectedPlanId, allPlans]),
    onPrevItem: useCallback(() => {
      if (!selectedPlanId) return;
      const currentIndex = allPlans.findIndex((p) => p.id === selectedPlanId);
      if (currentIndex > 0) {
        const prevPlan = allPlans[currentIndex - 1];
        if (prevPlan) {
          setSelectedPlanId(prevPlan.id);
        }
      }
    }, [selectedPlanId, allPlans]),
  });

  return {
    selectedPlanId,
    panelWidth,
    handleCardClick,
    handleClosePanel,
    handleChangeWidth,
    cycleWidth,
  };
}
