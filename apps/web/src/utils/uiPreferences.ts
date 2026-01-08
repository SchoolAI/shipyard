/**
 * UI state persistence utilities.
 * Follows pattern from identity.ts for localStorage management.
 */

const SIDEBAR_COLLAPSED_KEY = 'peer-plan-sidebar-collapsed';
const SHOW_ARCHIVED_KEY = 'peer-plan-show-archived';

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
