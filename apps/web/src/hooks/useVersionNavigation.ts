import { getSnapshots, type PlanSnapshot } from '@shipyard/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

interface VersionNavigationState {
  /** All available snapshots (sorted oldest to newest) */
  snapshots: PlanSnapshot[];
  /** Currently selected version index (0 = oldest, length-1 = newest/current) */
  currentIndex: number;
  /** Currently selected snapshot (null if viewing live version) */
  currentSnapshot: PlanSnapshot | null;
  /** Is viewing an old version (not the current/live state) */
  isViewingHistory: boolean;
  /** Navigate to previous version */
  goToPrevious: () => void;
  /** Navigate to next version */
  goToNext: () => void;
  /** Go to current/live version */
  goToCurrent: () => void;
  /** Can navigate to previous version */
  canGoPrevious: boolean;
  /** Can navigate to next version */
  canGoNext: boolean;
}

/**
 * Hook for navigating between plan versions.
 * Subscribes to Y.Array(YDOC_KEYS.SNAPSHOTS) for real-time updates.
 *
 * @param ydoc - The Y.Doc containing the plan
 * @returns Version navigation state and controls
 */
export function useVersionNavigation(ydoc: Y.Doc | null): VersionNavigationState {
  const [snapshots, setSnapshots] = useState<PlanSnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1); // -1 = current/live version

  // Subscribe to snapshots Y.Array
  useEffect(() => {
    if (!ydoc) return;

    const updateSnapshots = () => {
      const allSnapshots = getSnapshots(ydoc);
      setSnapshots(allSnapshots);

      // If viewing history and snapshots changed, stay on same relative position
      setCurrentIndex((prevIndex) => {
        if (prevIndex === -1) return -1; // Still viewing current
        return Math.min(prevIndex, allSnapshots.length - 1); // Clamp to valid range
      });
    };

    // Initial load
    updateSnapshots();

    // Subscribe to changes
    const snapshotsArray = ydoc.getArray('snapshots');
    snapshotsArray.observe(updateSnapshots);

    return () => snapshotsArray.unobserve(updateSnapshots);
  }, [ydoc]);

  const isViewingHistory = currentIndex >= 0;
  const currentSnapshot = isViewingHistory ? (snapshots[currentIndex] ?? null) : null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => {
      // If viewing current, go to last snapshot
      if (prev === -1) return snapshots.length - 1;
      // Otherwise go back one
      return Math.max(0, prev - 1);
    });
  };

  const goToNext = () => {
    setCurrentIndex((prev) => {
      // If at last snapshot, go to current
      if (prev === snapshots.length - 1) return -1;
      // Otherwise go forward one
      return prev + 1;
    });
  };

  const goToCurrent = () => {
    setCurrentIndex(-1);
  };

  const canGoPrevious = snapshots.length > 0 && (currentIndex > 0 || currentIndex === -1);
  const canGoNext = currentIndex >= 0; // Can always go to current from history

  return {
    snapshots,
    currentIndex,
    currentSnapshot,
    isViewingHistory,
    goToPrevious,
    goToNext,
    goToCurrent,
    canGoPrevious,
    canGoNext,
  };
}
