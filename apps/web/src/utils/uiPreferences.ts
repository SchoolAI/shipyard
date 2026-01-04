/**
 * UI state persistence utilities.
 * Follows pattern from identity.ts for localStorage management.
 */

const SIDEBAR_COLLAPSED_KEY = 'peer-plan-sidebar-collapsed';

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
