/**
 * Hook to manage Kanban column visibility preferences.
 * Persists user preference for hiding empty columns.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ColumnWithPlans } from '@/hooks/useKanbanColumns';
import {
  getHideEmptyColumns,
  setHideEmptyColumns as saveHideEmptyColumns,
} from '@/utils/uiPreferences';

/** Return type for the useColumnVisibility hook */
export interface UseColumnVisibilityReturn {
  /** Whether empty columns are currently hidden */
  hideEmptyColumns: boolean;
  /** Filtered columns based on visibility preference */
  visibleColumns: ColumnWithPlans[];
  /** Toggle empty column visibility */
  handleToggleEmptyColumns: () => void;
}

/**
 * Hook for managing column visibility on the Kanban board.
 * Persists the user's preference to localStorage.
 *
 * @param columns - All Kanban columns
 */
export function useColumnVisibility(columns: ColumnWithPlans[]): UseColumnVisibilityReturn {
  const [hideEmptyColumns, setHideEmptyColumns] = useState(getHideEmptyColumns);

  const visibleColumns = useMemo(() => {
    if (hideEmptyColumns) {
      return columns.filter((col) => col.plans.length > 0);
    }
    return columns;
  }, [columns, hideEmptyColumns]);

  const handleToggleEmptyColumns = useCallback(() => {
    const newValue = !hideEmptyColumns;
    setHideEmptyColumns(newValue);
    saveHideEmptyColumns(newValue);
  }, [hideEmptyColumns]);

  return {
    hideEmptyColumns,
    visibleColumns,
    handleToggleEmptyColumns,
  };
}
