import type { FrontierOpId, TaskEventItem, TaskId } from '@shipyard/loro-schema';
import { useCallback, useMemo, useState } from 'react';
import { useTaskEvents } from '@/loro/selectors/task-selectors';

/**
 * Version snapshot derived from task events.
 * Uses `approved` and `changes_requested` events as version markers.
 */
export interface VersionSnapshot {
  /** Event ID that created this version */
  eventId: string;
  /** When this version was created */
  createdAt: number;
  /** Who created this version */
  actor: string;
  /** Event type (approved or changes_requested) */
  type: 'approved' | 'changes_requested';
  /** Optional message from the event */
  message: string | null;
  /** Loro frontier at the time of review - enables time travel to view historical content */
  frontier: FrontierOpId[] | null;
}

/**
 * Base fields shared by all version navigation states.
 */
interface VersionNavigationBase {
  /** All available version snapshots (sorted oldest to newest) */
  snapshots: VersionSnapshot[];
  /** Currently selected version index (0 = oldest, length-1 = newest, -1 = live) */
  currentIndex: number;
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
 * Version navigation state - discriminated union on isViewingHistory.
 * When viewing history, currentSnapshot is guaranteed to be a valid VersionSnapshot.
 * When viewing live (not history), currentSnapshot is null.
 */
export type VersionNavigationState =
  | (VersionNavigationBase & { isViewingHistory: false; currentSnapshot: null })
  | (VersionNavigationBase & {
      isViewingHistory: true;
      currentSnapshot: VersionSnapshot;
    });

/**
 * Type guard for checking if viewing historical version.
 */
export function isViewingHistorySnapshot(
  state: VersionNavigationState
): state is VersionNavigationBase & {
  isViewingHistory: true;
  currentSnapshot: VersionSnapshot;
} {
  return state.isViewingHistory;
}

/**
 * Filter events to only include version-marking events.
 * Currently includes: approved, changes_requested
 */
function isVersionEvent(
  event: TaskEventItem
): event is Extract<TaskEventItem, { type: 'approved' | 'changes_requested' }> {
  return event.type === 'approved' || event.type === 'changes_requested';
}

/**
 * Convert a version event to a VersionSnapshot.
 */
function eventToSnapshot(
  event: Extract<TaskEventItem, { type: 'approved' | 'changes_requested' }>
): VersionSnapshot {
  return {
    eventId: event.id,
    createdAt: event.timestamp,
    actor: event.actor,
    type: event.type,
    message: event.message,
    frontier: event.frontier ?? null,
  };
}

/**
 * Hook for navigating between task versions.
 * Uses approved/changes_requested events as version markers.
 *
 * @param taskId - The task ID to navigate versions for
 * @returns Version navigation state and controls
 */
export function useVersionNavigation(taskId: TaskId): VersionNavigationState {
  const events = useTaskEvents(taskId);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  // Extract version snapshots from events
  const snapshots = useMemo(() => {
    const versionEvents = events.filter(isVersionEvent);
    // Sort oldest to newest (by timestamp)
    return versionEvents.map(eventToSnapshot).sort((a, b) => a.createdAt - b.createdAt);
  }, [events]);

  // Adjust index if snapshots changed
  const adjustedIndex = useMemo(() => {
    if (currentIndex === -1) return -1;
    // Clamp to valid range
    return Math.min(currentIndex, snapshots.length - 1);
  }, [currentIndex, snapshots.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      // If viewing current, go to last snapshot
      if (prev === -1) return snapshots.length - 1;
      // Otherwise go back one
      return Math.max(0, prev - 1);
    });
  }, [snapshots.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      // If at last snapshot, go to current
      if (prev === snapshots.length - 1) return -1;
      // Otherwise go forward one
      return prev + 1;
    });
  }, [snapshots.length]);

  const goToCurrent = useCallback(() => {
    setCurrentIndex(-1);
  }, []);

  const canGoPrevious = snapshots.length > 0 && (adjustedIndex > 0 || adjustedIndex === -1);
  const canGoNext = adjustedIndex >= 0;

  const base: VersionNavigationBase = {
    snapshots,
    currentIndex: adjustedIndex,
    goToPrevious,
    goToNext,
    goToCurrent,
    canGoPrevious,
    canGoNext,
  };

  const snapshot = adjustedIndex >= 0 ? snapshots[adjustedIndex] : undefined;

  if (adjustedIndex >= 0 && snapshot !== undefined) {
    return {
      ...base,
      isViewingHistory: true,
      currentSnapshot: snapshot,
    };
  }

  return {
    ...base,
    isViewingHistory: false,
    currentSnapshot: null,
  };
}
