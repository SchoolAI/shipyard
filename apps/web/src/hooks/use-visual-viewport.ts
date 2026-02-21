import { useEffect, useState } from 'react';

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Tracks the visual viewport height to keep UI pinned above the software keyboard.
 *
 * On iOS/Android, the layout viewport (`100dvh`) doesn't shrink when the keyboard
 * opens — only `window.visualViewport` reflects the actual visible area. This hook
 * returns the visual viewport height so callers can size containers to the real
 * visible area instead of relying on `dvh`/`vh` units.
 *
 * Returns null on desktop browsers (no software keyboard) so callers can fall back
 * to CSS viewport units.
 */
export function useVisualViewport(): number | null {
  const [height, setHeight] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    if (!isTouchDevice()) return null;
    return window.visualViewport ? Math.floor(window.visualViewport.height) : null;
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isTouchDevice()) return;

    const update = () => {
      const h = Math.floor(vv.height);
      setHeight((prev) => (prev === h ? prev : h));
    };

    update();
    vv.addEventListener('resize', update);

    return () => {
      vv.removeEventListener('resize', update);
    };
  }, []);

  return height;
}
