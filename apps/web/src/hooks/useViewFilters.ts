/**
 * Hook for filtering and sorting plans in the sidebar.
 * Pure functions for logic, React state for UI integration.
 */

import type { PlanIndexEntry, PlanStatusType } from '@peer-plan/schema';
import { PlanStatusValues } from '@peer-plan/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getViewPreferences,
  type SortOption,
  setViewPreferences,
  type ViewPreferences,
} from '@/utils/uiPreferences';

// --- Public Types ---

export interface ViewFiltersState {
  searchQuery: string;
  sortBy: SortOption;
  sortDirection: 'asc' | 'desc';
  statusFilters: PlanStatusType[];
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  toggleSortDirection: () => void;
  toggleStatusFilter: (status: PlanStatusType) => void;
  clearFilters: () => void;
}

export interface FilteredPlansResult {
  filteredPlans: PlanIndexEntry[];
  hasActiveFilters: boolean;
}

// --- Public API ---

/**
 * Hook for managing view filter state with localStorage persistence.
 * Debounces search query updates by 150ms.
 */
export function useViewFilters(): ViewFiltersState {
  const [preferences, setPreferencesState] = useState<ViewPreferences>(getViewPreferences);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(preferences.searchQuery);

  // Debounce search query updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreferencesState((prev) => {
        if (prev.searchQuery === debouncedSearchQuery) return prev;
        const updated = { ...prev, searchQuery: debouncedSearchQuery };
        setViewPreferences(updated);
        return updated;
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [debouncedSearchQuery]);

  const setSearchQuery = useCallback((query: string) => {
    setDebouncedSearchQuery(query);
  }, []);

  const setSortBy = useCallback((sort: SortOption) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, sortBy: sort };
      setViewPreferences(updated);
      return updated;
    });
  }, []);

  const toggleSortDirection = useCallback(() => {
    setPreferencesState((prev) => {
      const newDirection: 'asc' | 'desc' = prev.sortDirection === 'asc' ? 'desc' : 'asc';
      const updated = { ...prev, sortDirection: newDirection };
      setViewPreferences(updated);
      return updated;
    });
  }, []);

  const toggleStatusFilter = useCallback((status: PlanStatusType) => {
    setPreferencesState((prev) => {
      const newFilters = prev.statusFilters.includes(status)
        ? prev.statusFilters.filter((s) => s !== status)
        : [...prev.statusFilters, status];
      const updated = { ...prev, statusFilters: newFilters };
      setViewPreferences(updated);
      return updated;
    });
  }, []);

  const clearFilters = useCallback(() => {
    const cleared: ViewPreferences = {
      searchQuery: '',
      sortBy: 'updated',
      sortDirection: 'desc',
      statusFilters: [],
    };
    setDebouncedSearchQuery('');
    setPreferencesState(cleared);
    setViewPreferences(cleared);
  }, []);

  return {
    searchQuery: debouncedSearchQuery,
    sortBy: preferences.sortBy,
    sortDirection: preferences.sortDirection,
    statusFilters: preferences.statusFilters,
    setSearchQuery,
    setSortBy,
    toggleSortDirection,
    toggleStatusFilter,
    clearFilters,
  };
}

/**
 * Filters and sorts a list of plans based on view preferences.
 * Pure function for easy testing.
 */
export function filterAndSortPlans(
  plans: PlanIndexEntry[],
  searchQuery: string,
  sortBy: SortOption,
  statusFilters: PlanStatusType[],
  sortDirection: 'asc' | 'desc' = 'desc'
): FilteredPlansResult {
  let filtered = plans;

  // Apply search filter (case-insensitive includes)
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((plan) => plan.title.toLowerCase().includes(query));
  }

  // Apply status filter (OR logic - show plans matching any selected status)
  if (statusFilters.length > 0) {
    filtered = filtered.filter((plan) => statusFilters.includes(plan.status));
  }

  // Sort plans
  const sorted = sortPlans(filtered, sortBy, sortDirection);

  return {
    filteredPlans: sorted,
    hasActiveFilters: searchQuery.trim() !== '' || statusFilters.length > 0,
  };
}

/**
 * Hook that combines filter state with plan filtering.
 * Returns filtered plans and filter controls.
 */
export function useFilteredPlans(plans: PlanIndexEntry[]): FilteredPlansResult & ViewFiltersState {
  const filters = useViewFilters();

  const result = useMemo(
    () =>
      filterAndSortPlans(
        plans,
        filters.searchQuery,
        filters.sortBy,
        filters.statusFilters,
        filters.sortDirection
      ),
    [plans, filters.searchQuery, filters.sortBy, filters.statusFilters, filters.sortDirection]
  );

  return { ...result, ...filters };
}

// --- Sort Options (for UI) ---

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'status', label: 'Status' },
];

export const STATUS_FILTER_OPTIONS: { value: PlanStatusType; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'default' },
  { value: 'pending_review', label: 'Pending Review', color: 'warning' },
  { value: 'changes_requested', label: 'Changes Requested', color: 'danger' },
  { value: 'in_progress', label: 'In Progress', color: 'primary' },
  { value: 'completed', label: 'Completed', color: 'success' },
];

// --- Private Helpers ---

function sortPlans(
  plans: PlanIndexEntry[],
  sortBy: SortOption,
  direction: 'asc' | 'desc' = 'desc'
): PlanIndexEntry[] {
  const sorted = [...plans];
  const multiplier = direction === 'asc' ? 1 : -1;

  switch (sortBy) {
    case 'name':
      return sorted.sort((a, b) => multiplier * a.title.localeCompare(b.title));

    case 'newest':
      return sorted.sort((a, b) => multiplier * (b.createdAt - a.createdAt));

    case 'updated':
      return sorted.sort((a, b) => multiplier * (b.updatedAt - a.updatedAt));

    case 'status':
      // Sort by status workflow order
      return sorted.sort((a, b) => {
        const aIndex = PlanStatusValues.indexOf(a.status);
        const bIndex = PlanStatusValues.indexOf(b.status);
        return multiplier * (aIndex - bIndex);
      });

    default: {
      // Exhaustive check
      const _exhaustive: never = sortBy;
      throw new Error(`Unhandled sort option: ${_exhaustive}`);
    }
  }
}
