/**
 * UI state persistence utilities.
 * Follows pattern from identity.ts for localStorage management.
 */

import { type PlanStatusType, PlanStatusValues } from "@shipyard/schema";
import { z } from "zod";

/** --- Types --- */

export type SortOption = "name" | "newest" | "updated" | "status";

export interface ViewPreferences {
	/** Search query for filtering plans */
	searchQuery: string;
	/** Current sort option */
	sortBy: SortOption;
	/** Sort direction */
	sortDirection: "asc" | "desc";
	/** Active status filters (empty = show all) */
	statusFilters: PlanStatusType[];
	/** Active tag filters (empty = show all, OR logic) */
	tagFilters: string[];
}

/** --- Storage Keys --- */

const SIDEBAR_COLLAPSED_KEY = "shipyard-sidebar-collapsed";
const SHOW_ARCHIVED_KEY = "shipyard-show-archived";
const VIEW_PREFERENCES_KEY = "shipyard-view-preferences";
const KANBAN_HIDE_EMPTY_COLUMNS_KEY = "kanban-hide-empty-columns";
const INBOX_SHOW_READ_KEY = "shipyard-inbox-show-read";

/** Get sidebar collapsed state from localStorage */
export function getSidebarCollapsed(): boolean {
	try {
		return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
	} catch {
		return false;
	}
}

/** Save sidebar collapsed state to localStorage */
export function setSidebarCollapsed(collapsed: boolean): void {
	try {
		localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
	} catch {
		/** Ignore storage errors (e.g., private browsing) */
	}
}

/** Get show archived plans state from localStorage */
export function getShowArchived(): boolean {
	try {
		return localStorage.getItem(SHOW_ARCHIVED_KEY) === "true";
	} catch {
		return false;
	}
}

/** Save show archived plans state to localStorage */
export function setShowArchived(show: boolean): void {
	try {
		localStorage.setItem(SHOW_ARCHIVED_KEY, String(show));
	} catch {
		/** Ignore storage errors (e.g., private browsing) */
	}
}

/** --- View Preferences --- */

const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
	searchQuery: "",
	sortBy: "updated",
	sortDirection: "desc",
	statusFilters: [],
	tagFilters: [],
};

/** Zod schema for validating stored view preferences */
const ViewPreferencesSchema = z.object({
	searchQuery: z.string().optional(),
	sortBy: z.enum(["name", "newest", "updated", "status"]).optional(),
	sortDirection: z.enum(["asc", "desc"]).optional(),
	statusFilters: z.array(z.enum(PlanStatusValues)).optional(),
	tagFilters: z.array(z.string()).optional(),
});

/** Get view preferences from localStorage */
export function getViewPreferences(): ViewPreferences {
	try {
		const stored = localStorage.getItem(VIEW_PREFERENCES_KEY);
		if (!stored) return DEFAULT_VIEW_PREFERENCES;

		const json: unknown = JSON.parse(stored);
		const result = ViewPreferencesSchema.safeParse(json);
		if (!result.success) return DEFAULT_VIEW_PREFERENCES;
		const parsed = result.data;

		return {
			searchQuery: parsed.searchQuery ?? DEFAULT_VIEW_PREFERENCES.searchQuery,
			sortBy: parsed.sortBy ?? DEFAULT_VIEW_PREFERENCES.sortBy,
			sortDirection:
				parsed.sortDirection ?? DEFAULT_VIEW_PREFERENCES.sortDirection,
			statusFilters:
				parsed.statusFilters ?? DEFAULT_VIEW_PREFERENCES.statusFilters,
			tagFilters: parsed.tagFilters ?? DEFAULT_VIEW_PREFERENCES.tagFilters,
		};
	} catch {
		return DEFAULT_VIEW_PREFERENCES;
	}
}

/** Save view preferences to localStorage */
export function setViewPreferences(
	preferences: Partial<ViewPreferences>,
): void {
	try {
		const current = getViewPreferences();
		const updated = { ...current, ...preferences };
		localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(updated));
	} catch {
		/** Ignore storage errors (e.g., private browsing) */
	}
}

/** --- Kanban Board Preferences --- */

/** Get hide empty columns preference from localStorage */
export function getHideEmptyColumns(): boolean {
	try {
		return localStorage.getItem(KANBAN_HIDE_EMPTY_COLUMNS_KEY) === "true";
	} catch {
		return false;
	}
}

/** Save hide empty columns preference to localStorage */
export function setHideEmptyColumns(hide: boolean): void {
	try {
		localStorage.setItem(KANBAN_HIDE_EMPTY_COLUMNS_KEY, String(hide));
	} catch {
		/** Ignore storage errors (e.g., private browsing) */
	}
}

/** --- Inbox Preferences --- */

/** Get inbox show read preference from localStorage */
export function getInboxShowRead(): boolean {
	try {
		return localStorage.getItem(INBOX_SHOW_READ_KEY) === "true";
	} catch {
		return false;
	}
}

/** Save inbox show read preference to localStorage */
export function setInboxShowRead(show: boolean): void {
	try {
		localStorage.setItem(INBOX_SHOW_READ_KEY, String(show));
	} catch {
		/** Ignore storage errors (e.g., private browsing mode) */
	}
}
