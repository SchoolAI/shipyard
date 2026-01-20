/**
 * Hook for grouping plans into Kanban columns by status.
 * Architecture supports future extension to tag-based columns.
 */

import type { PlanIndexEntry, PlanStatusType } from '@shipyard/schema';
import { useMemo } from 'react';
import { assertNever } from '@/utils/assert-never';

/** Column IDs - exhaustive list */
export type ColumnId = 'draft' | 'in_review' | 'in_progress' | 'completed';

/** Valid chip color types from HeroUI v3 */
type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger';

/** Column definition - extensible for future tag-based columns */
export interface ColumnDefinition {
  id: ColumnId;
  label: string;
  color: ChipColor;
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

/** Tag column definition - same as ColumnDefinition but with string id */
export interface TagColumnDefinition {
  id: string;
  label: string;
  color: ChipColor;
  filter: (plan: PlanIndexEntry) => boolean;
  plans: PlanIndexEntry[];
}

/**
 * Hook to group plans into Kanban columns by tags.
 * Creates one column per unique tag, plus "Untagged" column.
 * Plans can appear in multiple columns (non-exclusive).
 *
 * @param plans - All plans to group
 * @param selectedTags - Optional array of tags to show as columns (empty = show all tags)
 * @returns Array of columns with their plans, sorted by updatedAt within each column
 */
export function useTagColumns(
  plans: PlanIndexEntry[],
  selectedTags?: string[]
): TagColumnDefinition[] {
  return useMemo(() => {
    const activePlans = plans.filter((p) => !p.deleted);

    // Collect all unique tags from active plans
    const allTags = new Set<string>();
    for (const plan of activePlans) {
      if (plan.tags) {
        for (const tag of plan.tags) {
          allTags.add(tag);
        }
      }
    }

    // Filter to selected tags if provided
    const tagsToShow =
      selectedTags && selectedTags.length > 0
        ? selectedTags.filter((t) => allTags.has(t))
        : Array.from(allTags).sort();

    // Create column for each tag
    const tagColumns: TagColumnDefinition[] = tagsToShow.map((tag) => ({
      id: `tag-${tag}`,
      label: tag,
      color: 'accent',
      filter: (p: PlanIndexEntry) => p.tags?.includes(tag) ?? false,
      plans: activePlans
        .filter((p) => p.tags?.includes(tag))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }));

    // Add "Untagged" column at the end
    const untaggedPlans = activePlans.filter((p) => !p.tags || p.tags.length === 0);
    if (untaggedPlans.length > 0) {
      tagColumns.push({
        id: 'untagged',
        label: 'Untagged',
        color: 'default',
        filter: (p: PlanIndexEntry) => !p.tags || p.tags.length === 0,
        plans: untaggedPlans.sort((a, b) => b.updatedAt - a.updatedAt),
      });
    }

    return tagColumns;
  }, [plans, selectedTags]);
}
