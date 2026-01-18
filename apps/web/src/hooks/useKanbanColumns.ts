/**
 * Hook for grouping plans into Kanban columns by status.
 * Architecture supports future extension to tag-based columns.
 */

import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { useMemo } from 'react';
import { assertNever } from '@/utils/assert-never';

/** Column IDs - exhaustive list */
export type ColumnId = 'draft' | 'in_review' | 'in_progress' | 'completed';

/** Column definition - extensible for future tag-based columns */
export interface ColumnDefinition {
  id: ColumnId;
  label: string;
  color: 'default' | 'warning' | 'success' | 'danger' | 'accent';
  filter: (plan: PlanIndexEntry) => boolean;
}

/** Column with its plans */
export interface ColumnWithPlans extends ColumnDefinition {
  plans: PlanIndexEntry[];
}

/** Status column configurations - consolidated to 4 columns */
const STATUS_COLUMNS: ColumnDefinition[] = [
  {
    id: 'draft',
    label: 'Draft',
    color: 'default',
    filter: (p) => p.status === 'draft',
  },
  {
    id: 'in_review',
    label: 'In Review',
    color: 'warning',
    filter: (p) => p.status === 'pending_review' || p.status === 'changes_requested',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    color: 'accent',
    filter: (p) => p.status === 'in_progress',
  },
  {
    id: 'completed',
    label: 'Done',
    color: 'success',
    filter: (p) => p.status === 'completed',
  },
];

/**
 * Map column ID to PlanStatusType for drag-drop updates.
 * The 'in_review' column maps to 'pending_review' as the default status.
 */
export function columnIdToStatus(columnId: ColumnId): PlanStatusType {
  switch (columnId) {
    case 'draft':
      return 'draft';
    case 'in_review':
      return 'pending_review';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    default:
      assertNever(columnId);
  }
}

/**
 * Hook to group plans into Kanban columns by status.
 *
 * @param plans - All plans to group
 * @returns Array of columns with their plans, sorted by updatedAt within each column
 */
export function useKanbanColumns(plans: PlanIndexEntry[]): ColumnWithPlans[] {
  return useMemo(() => {
    // Filter out archived plans
    const activePlans = plans.filter((p) => !p.deleted);

    return STATUS_COLUMNS.map((column) => ({
      ...column,
      plans: activePlans.filter(column.filter).sort((a, b) => b.updatedAt - a.updatedAt), // Most recent first
    }));
  }, [plans]);
}
