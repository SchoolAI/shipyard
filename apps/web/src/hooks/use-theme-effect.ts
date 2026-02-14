import { useEffect } from 'react';
import { useUIStore } from '../stores';
import { assertNever } from '../utils/assert-never';

function applyThemeToDOM(resolved: 'dark' | 'light') {
  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  html.classList.add(resolved);
  html.setAttribute('data-theme', resolved);
}

function resolveSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useThemeEffect() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    switch (theme) {
      case 'dark':
      case 'light':
        applyThemeToDOM(theme);
        return;
      case 'system': {
        applyThemeToDOM(resolveSystemTheme());

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => {
          applyThemeToDOM(e.matches ? 'dark' : 'light');
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
      }
      default:
        return assertNever(theme);
    }
  }, [theme]);
}
