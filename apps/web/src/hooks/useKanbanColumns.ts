/**
 * Hook for grouping plans into Kanban columns by status.
 * Architecture supports future extension to tag-based columns.
 */

import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { useMemo } from 'react';

/** Column definition - extensible for future tag-based columns */
export interface ColumnDefinition {
  id: string;
  label: string;
  color: 'default' | 'warning' | 'success' | 'danger' | 'accent';
  filter: (plan: PlanIndexEntry) => boolean;
}

/** Column with its plans */
export interface ColumnWithPlans extends ColumnDefinition {
  plans: PlanIndexEntry[];
}

/** Status column configurations */
const STATUS_COLUMNS: ColumnDefinition[] = [
  {
    id: 'draft',
    label: 'Draft',
    color: 'default',
    filter: (p) => p.status === 'draft',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    color: 'accent',
    filter: (p) => p.status === 'in_progress',
  },
  {
    id: 'pending_review',
    label: 'Pending Review',
    color: 'warning',
    filter: (p) => p.status === 'pending_review',
  },
  {
    id: 'changes_requested',
    label: 'Changes Requested',
    color: 'danger',
    filter: (p) => p.status === 'changes_requested',
  },
  {
    id: 'approved',
    label: 'Approved',
    color: 'success',
    filter: (p) => p.status === 'approved',
  },
  {
    id: 'completed',
    label: 'Completed',
    color: 'success',
    filter: (p) => p.status === 'completed',
  },
];

/**
 * Map column ID to PlanStatusType for drag-drop updates.
 */
export function columnIdToStatus(columnId: string): PlanStatusType | null {
  const statusIds: PlanStatusType[] = [
    'draft',
    'in_progress',
    'pending_review',
    'changes_requested',
    'approved',
    'completed',
  ];
  return statusIds.includes(columnId as PlanStatusType) ? (columnId as PlanStatusType) : null;
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
    const activePlans = plans.filter((p) => !p.deletedAt);

    return STATUS_COLUMNS.map((column) => ({
      ...column,
      plans: activePlans.filter(column.filter).sort((a, b) => b.updatedAt - a.updatedAt), // Most recent first
    }));
  }, [plans]);
}

/**
 * Future: Create columns from tags.
 * Uncomment and use when tag support is added.
 *
 * export function useTagColumns(plans: PlanIndexEntry[], tags: string[]): ColumnWithPlans[] {
 *   return useMemo(() => {
 *     return tags.map(tag => ({
 *       id: `tag-${tag}`,
 *       label: tag,
 *       color: 'default' as const,
 *       filter: (p: PlanIndexEntry) => p.tags?.includes(tag) ?? false,
 *       plans: plans.filter(p => p.tags?.includes(tag)).sort((a, b) => b.updatedAt - a.updatedAt),
 *     }));
 *   }, [plans, tags]);
 * }
 */
