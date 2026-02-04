import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';

/**
 * Schema for theme validation.
 * localStorage is user-controllable storage - validate to prevent injection.
 */
const ThemeSchema = z.enum(['light', 'dark', 'system']);
type Theme = z.infer<typeof ThemeSchema>;

/** Custom event for cross-component synchronization (storage events only fire across tabs) */
const THEME_CHANGE_EVENT = 'theme-change';

/**
 * Safely parse theme from localStorage with validation.
 * @returns Validated theme or 'system' as default
 */
function parseThemeFromStorage(value: string | null): Theme {
  const result = ThemeSchema.safeParse(value);
  return result.success ? result.data : 'system';
}

/** Shared state for theme across all hook instances */
let currentTheme: Theme = 'system';
const listeners = new Set<() => void>();

/** Initialize from localStorage (only once) */
if (typeof window !== 'undefined') {
  currentTheme = parseThemeFromStorage(localStorage.getItem('theme'));
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return 'system';
}

function setThemeValue(newTheme: Theme): void {
  if (newTheme === currentTheme) return;
  currentTheme = newTheme;
  localStorage.setItem('theme', newTheme);

  /** Notify all listeners */
  for (const listener of listeners) {
    listener();
  }

  /** Dispatch custom event for any edge cases */
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: newTheme }));
}

function applyThemeToDOM(theme: Theme): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme === 'dark' || (theme === 'system' && systemDark)) {
    root.setAttribute('data-theme', 'dark');
    root.classList.add('dark');
  } else {
    root.removeAttribute('data-theme');
    root.classList.remove('dark');
  }
}

export type ResolvedTheme = 'light' | 'dark';

function getResolvedTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeValue(newTheme);
  }, []);

  /** Compute resolved theme (what's actually applied) */
  const resolvedTheme = getResolvedTheme(theme);

  /** Apply theme to DOM when it changes */
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  /** Listen for system preference changes when theme is 'system' */
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      applyThemeToDOM(theme);
      /** Force all listeners to re-render to pick up new effective theme */
      for (const listener of listeners) {
        listener();
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  /** Listen for storage events (cross-tab sync) */
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'theme' && e.newValue) {
        /** Validate storage event value - could come from another tab/window */
        const newTheme = parseThemeFromStorage(e.newValue);
        if (newTheme !== currentTheme) {
          currentTheme = newTheme;
          for (const listener of listeners) {
            listener();
          }
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { theme, setTheme, resolvedTheme };
}
