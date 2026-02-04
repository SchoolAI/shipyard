import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';

const ThemeSchema = z.enum(['light', 'dark', 'system']);
type Theme = z.infer<typeof ThemeSchema>;

const THEME_CHANGE_EVENT = 'theme-change';

function parseThemeFromStorage(value: string | null): Theme {
  const result = ThemeSchema.safeParse(value);
  return result.success ? result.data : 'system';
}

let currentTheme: Theme = 'system';
const listeners = new Set<() => void>();

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

  for (const listener of listeners) {
    listener();
  }

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

  const resolvedTheme = getResolvedTheme(theme);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      applyThemeToDOM(theme);
      for (const listener of listeners) {
        listener();
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'theme' && e.newValue) {
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
