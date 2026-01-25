/**
 * Hook to manage drag-and-drop handlers for Kanban board.
 * Handles drag start, end, cancel events and status updates.
 */

import type { Announcements, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  getPlanIndexEntry,
  type PlanIndexEntry,
  PlanIndexEntrySchema,
  type PlanStatusType,
  type StatusTransition,
  setPlanIndexEntry,
  transitionPlanStatus,
} from '@shipyard/schema';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { type ColumnId, columnIdToStatus } from '@/hooks/useKanbanColumns';
import { assertNever } from '@/utils/assert-never';

/** GitHub identity for attributing actions */
interface GitHubIdentity {
  username: string;
  displayName: string;
}

/** Return type for the useKanbanDragHandlers hook */
export interface UseKanbanDragHandlersReturn {
  /** Currently dragged plan (null when not dragging) */
  activePlan: PlanIndexEntry | null;
  /** Handle drag start event */
  handleDragStart: (event: DragStartEvent) => void;
  /** Handle drag end event */
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  /** Handle drag cancel event */
  handleDragCancel: () => void;
}

/**
 * Type guard to safely extract PlanIndexEntry from drag data.
 */
function getDragPlan(
  data: { current?: { plan?: unknown } } | undefined
): PlanIndexEntry | undefined {
  const plan = data?.current?.plan;
  const result = PlanIndexEntrySchema.safeParse(plan);
  return result.success ? result.data : undefined;
}

/**
 * Determine the target column ID from a drag-drop event.
 */
function getTargetColumnId(event: DragEndEvent, allPlans: PlanIndexEntry[]): ColumnId | null {
  const { over } = event;
  if (!over) return null;

  /** Dropped directly on a column */
  if (over.data.current?.type === 'column') {
    const columnId = String(over.id);
    /** Validate that it's a valid ColumnId */
    if (
      columnId === 'draft' ||
      columnId === 'in_review' ||
      columnId === 'in_progress' ||
      columnId === 'completed'
    ) {
      return columnId;
    }
    return null;
  }

  /** Dropped on a card - get the card's current status and map to column ID */
  if (over.data.current?.type === 'plan') {
    const targetPlan = allPlans.find((p) => p.id === over.id);
    if (!targetPlan) return null;

    /** Map status to column ID */
    const status = targetPlan.status;
    switch (status) {
      case 'draft':
        return 'draft';
      case 'pending_review':
      case 'changes_requested':
        return 'in_review';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      default:
        assertNever(status);
    }
  }

  return null;
}

/**
 * Build the appropriate status transition for drag-drop operations.
 * Returns null if the transition is not valid or requires user input.
 */
function buildDragDropTransition(
  newStatus: PlanStatusType,
  reviewedBy: string,
  now: number
): StatusTransition | null {
  switch (newStatus) {
    case 'in_progress':
      /** Approval transition (from pending_review or changes_requested) */
      return { status: 'in_progress', reviewedAt: now, reviewedBy };
    case 'changes_requested':
      /** Request changes transition */
      return { status: 'changes_requested', reviewedAt: now, reviewedBy };
    case 'completed':
      /** Completion transition */
      return { status: 'completed', completedAt: now, completedBy: reviewedBy };
    case 'pending_review':
      /**
       * NOTE: This transition requires a reviewRequestId which we don't have in drag-drop
       * The index update will still work, but the plan doc won't be updated
       */
      return null;
    case 'draft':
      /** Cannot transition back to draft via state machine */
      return null;
    default:
      return null;
  }
}

/**
 * Update the plan's status in both the index CRDT and the plan's own metadata.
 * Uses transitionPlanStatus for type-safe status transitions.
 */
async function updatePlanStatus(
  indexDoc: Y.Doc,
  planId: string,
  newStatus: PlanStatusType,
  reviewedBy: string
): Promise<void> {
  const now = Date.now();

  /** Update in plan-index CRDT (always succeeds for UI consistency) */
  const entry = getPlanIndexEntry(indexDoc, planId);
  if (entry) {
    setPlanIndexEntry(indexDoc, {
      ...entry,
      status: newStatus,
      updatedAt: now,
    });
  }

  /** Build the appropriate transition for the target status */
  const transition = buildDragDropTransition(newStatus, reviewedBy, now);

  /** Also update the plan's own metadata using type-safe transition */
  try {
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    /**
     * NOTE: Transition may fail if plan is in an unexpected state - that's OK for drag-drop UI
     * The index update is the UI source of truth
     */
    if (transition) {
      transitionPlanStatus(planDoc, transition);
    }

    idb.destroy();
  } catch {
    /** Plan doc may not exist locally - index update is sufficient */
  }
}

/**
 * Hook for managing drag-and-drop operations on the Kanban board.
 * Handles status updates when cards are dropped in different columns.
 *
 * @param allPlans - All plans for target lookup
 * @param indexDoc - Plan index Y.Doc
 * @param githubIdentity - GitHub identity for attributing actions
 */
export function useKanbanDragHandlers(
  allPlans: PlanIndexEntry[],
  indexDoc: Y.Doc,
  githubIdentity: GitHubIdentity | null
): UseKanbanDragHandlersReturn {
  const [activePlan, setActivePlan] = useState<PlanIndexEntry | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const planId = String(event.active.id);
      const plan = allPlans.find((p) => p.id === planId);
      if (plan) {
        setActivePlan(plan);
      }
    },
    [allPlans]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActivePlan(null);

      const planId = String(event.active.id);
      const plan = allPlans.find((p) => p.id === planId);
      if (!plan) return;

      const targetColumnId = getTargetColumnId(event, allPlans);
      if (!targetColumnId) return;

      const newStatus = columnIdToStatus(targetColumnId);
      if (plan.status === newStatus) return;

      const reviewedBy = githubIdentity?.displayName || githubIdentity?.username || 'Unknown';
      await updatePlanStatus(indexDoc, planId, newStatus, reviewedBy);
      toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
    },
    [allPlans, indexDoc, githubIdentity]
  );

  const handleDragCancel = useCallback(() => {
    setActivePlan(null);
  }, []);

  return {
    activePlan,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}

/**
 * Helper to extract status label from drag event data.
 */
function getStatusFromDragData(data: { current?: Record<string, unknown> } | undefined): string {
  const columnData = data?.current;
  const column = columnData?.column;
  const columnId = column && typeof column === 'object' && 'id' in column ? column.id : null;
  return String(columnData?.status || columnId || 'unknown');
}

/**
 * Accessibility announcements for drag-and-drop operations.
 * Provides screen reader feedback for Kanban board interactions.
 */
export const kanbanAnnouncements: Announcements = {
  onDragStart({ active }) {
    const plan = getDragPlan(active.data);
    return `Picked up task: ${plan?.title || 'unknown'}`;
  },
  onDragOver({ active, over }) {
    const plan = getDragPlan(active.data);
    if (over) {
      const status = getStatusFromDragData(over.data);
      return `Task ${plan?.title || 'unknown'} is over ${status.replace('_', ' ')} column`;
    }
    return `Task ${plan?.title || 'unknown'} is no longer over a droppable area`;
  },
  onDragEnd({ active, over }) {
    const plan = getDragPlan(active.data);
    if (over) {
      const status = getStatusFromDragData(over.data);
      return `Task ${plan?.title || 'unknown'} was moved to ${status.replace('_', ' ')} column`;
    }
    return `Drag cancelled for task: ${plan?.title || 'unknown'}`;
  },
  onDragCancel({ active }) {
    const plan = getDragPlan(active.data);
    return `Dragging was cancelled. Task ${plan?.title || 'unknown'} was not moved.`;
  },
};

/** Re-export for use in announcements */
export { getDragPlan };
