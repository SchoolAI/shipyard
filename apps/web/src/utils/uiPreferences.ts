/**
 * UI state persistence utilities.
 * Follows pattern from identity.ts for localStorage management.
 */

import type { PlanStatusType } from '@peer-plan/schema';

// --- Types ---

export type SortOption = 'name' | 'newest' | 'updated' | 'status';

export interface ViewPreferences {
  /** Search query for filtering plans */
  searchQuery: string;
  /** Current sort option */
  sortBy: SortOption;
  /** Active status filters (empty = show all) */
  statusFilters: PlanStatusType[];
}

// --- Storage Keys ---

const SIDEBAR_COLLAPSED_KEY = 'peer-plan-sidebar-collapsed';
const SHOW_ARCHIVED_KEY = 'peer-plan-show-archived';
const VIEW_PREFERENCES_KEY = 'peer-plan-view-preferences';

/** Get sidebar collapsed state from localStorage */
export function getSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false; // default: expanded
  }
}

/** Save sidebar collapsed state to localStorage */
export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
}

/** Get show archived plans state from localStorage */
export function getShowArchived(): boolean {
  try {
    return localStorage.getItem(SHOW_ARCHIVED_KEY) === 'true';
  } catch {
    return false; // default: hide archived
  }
}

/** Save show archived plans state to localStorage */
export function setShowArchived(show: boolean): void {
  try {
    localStorage.setItem(SHOW_ARCHIVED_KEY, String(show));
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
}

// --- View Preferences ---

const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  searchQuery: '',
  sortBy: 'updated',
  statusFilters: [],
};

/** Get view preferences from localStorage */
export function getViewPreferences(): ViewPreferences {
  try {
    const stored = localStorage.getItem(VIEW_PREFERENCES_KEY);
    if (!stored) return DEFAULT_VIEW_PREFERENCES;

    const parsed = JSON.parse(stored) as Partial<ViewPreferences>;
    return {
      searchQuery: parsed.searchQuery ?? DEFAULT_VIEW_PREFERENCES.searchQuery,
      sortBy: parsed.sortBy ?? DEFAULT_VIEW_PREFERENCES.sortBy,
      statusFilters: parsed.statusFilters ?? DEFAULT_VIEW_PREFERENCES.statusFilters,
    };
  } catch {
    return DEFAULT_VIEW_PREFERENCES;
  }
}

/** Save view preferences to localStorage */
export function setViewPreferences(preferences: Partial<ViewPreferences>): void {
  try {
    const current = getViewPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors (e.g., private browsing)
  }
}
