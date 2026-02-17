import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const MIN_WIDTH = 400;
const MAX_WIDTH_PERCENT = 0.8;
const DEFAULT_WIDTH_PERCENT = 0.5;
const KEYBOARD_STEP = 20;

interface UseResizablePanelOptions {
  isOpen: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  minWidth?: number;
  maxWidthPercent?: number;
  keyboardStep?: number;
}

interface UseResizablePanelReturn {
  panelRef: RefObject<HTMLElement | null>;
  separatorProps: {
    role: 'separator';
    'aria-orientation': 'vertical';
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    'aria-label': string;
    tabIndex: number;
    onPointerDown: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    style: CSSProperties;
    className: string;
  };
  panelStyle: CSSProperties;
  isDragging: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Manages a resizable panel via pointer drag on a separator.
 *
 * ## Why the "settling" phase exists
 *
 * During drag, we bypass React and write `panel.style.width` directly for
 * 60fps performance. On pointer-up we need to hand control back to React
 * (which owns `style.width` via `panelStyle`). The tricky part:
 *
 * 1. We update the Zustand store (external to React).
 * 2. `useSyncExternalStore` schedules a re-render, but it is NOT guaranteed
 *    to flush synchronously — even inside `flushSync`, because `flushSync`
 *    only forces React's own state updates (`useState`/`useReducer`).
 * 3. If we remove our inline width override before React re-renders with the
 *    new store value, the panel briefly shows the OLD width.
 * 4. Worse: if CSS transitions are re-enabled at the same time, the browser
 *    ANIMATES from old-width to new-width — the visible "snap-back" bug.
 *
 * Solution: a three-phase lifecycle:
 *   - **dragging**: direct DOM, transitions disabled, React style ignored
 *   - **settling**: drag ended, store updated, but we keep the inline width
 *     override and transitions disabled until a `useEffect` confirms React
 *     has re-rendered with the correct width
 *   - **idle**: React owns the width, transitions enabled
 */
export function useResizablePanel({
  isOpen,
  width,
  onWidthChange,
  minWidth = MIN_WIDTH,
  maxWidthPercent = MAX_WIDTH_PERCENT,
  keyboardStep = KEYBOARD_STEP,
}: UseResizablePanelOptions): UseResizablePanelReturn {
  const panelRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  /** True while we wait for React to render the final width from the store. */
  const [isSettling, setIsSettling] = useState(false);
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

  /** The width we told the store to use on drag-end. */
  const settleTargetRef = useRef<number | null>(null);

  const dragStateRef = useRef<{
    initialClientX: number;
    initialWidth: number;
    currentWidth: number;
    rafId: number | null;
  } | null>(null);

  const getMaxWidth = useCallback(
    () => Math.floor(window.innerWidth * maxWidthPercent),
    [maxWidthPercent]
  );

  useEffect(() => {
    return () => {
      const state = dragStateRef.current;
      if (state?.rafId != null) {
        cancelAnimationFrame(state.rafId);
      }
      dragStateRef.current = null;
    };
  }, []);

  /*
   * Settling effect: fires after React re-renders with the new store value.
   * At that point it is safe to remove the inline width override and
   * re-enable CSS transitions.
   */
  useEffect(() => {
    if (!isSettling) return;

    const panel = panelRef.current;
    if (!panel) {
      setIsSettling(false);
      return;
    }

    requestAnimationFrame(() => {
      panel.style.removeProperty('width');
      panel.style.removeProperty('transition');
      setIsSettling(false);
    });
  }, [isSettling]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;

      const panel = panelRef.current;
      if (!panel) return;

      const target = e.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      target.setPointerCapture(e.pointerId);

      panel.style.transition = 'none';

      const actualWidth = panel.getBoundingClientRect().width;

      dragStateRef.current = {
        initialClientX: e.clientX,
        initialWidth: actualWidth,
        currentWidth: actualWidth,
        rafId: null,
      };
      setIsDragging(true);

      const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        const delta = state.initialClientX - moveEvent.clientX;
        const clamped = clamp(state.initialWidth + delta, minWidth, getMaxWidth());
        state.currentWidth = clamped;

        if (state.rafId !== null) return;
        state.rafId = requestAnimationFrame(() => {
          if (dragStateRef.current) {
            panel.style.width = `${dragStateRef.current.currentWidth}px`;
            dragStateRef.current.rafId = null;
          }
        });
      };

      const onPointerEnd = () => {
        const state = dragStateRef.current;
        if (!state) return;

        if (state.rafId !== null) {
          cancelAnimationFrame(state.rafId);
        }

        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', onPointerEnd);
        target.removeEventListener('pointercancel', onPointerEnd);

        const finalWidth = state.currentWidth;
        dragStateRef.current = null;

        /*
         * Keep the inline width as a bridge — it will be removed by the
         * settling effect once React has rendered with the correct value.
         */
        panel.style.width = `${finalWidth}px`;
        settleTargetRef.current = finalWidth;

        /*
         * Update the store and transition to settling phase.
         * We do NOT remove the inline style here — that's the settling
         * effect's job, ensuring React has had a chance to render first.
         */
        onWidthChangeRef.current(finalWidth);
        setIsDragging(false);
        setIsSettling(true);
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerEnd);
      target.addEventListener('pointercancel', onPointerEnd);
    },
    [minWidth, getMaxWidth]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const maxWidth = getMaxWidth();
      let newWidth: number | null = null;

      switch (e.key) {
        case 'ArrowLeft':
          newWidth = clamp(width + keyboardStep, minWidth, maxWidth);
          break;
        case 'ArrowRight':
          newWidth = clamp(width - keyboardStep, minWidth, maxWidth);
          break;
        case 'Home':
          newWidth = minWidth;
          break;
        case 'End':
          newWidth = maxWidth;
          break;
        default:
          return;
      }

      e.preventDefault();
      onWidthChangeRef.current(newWidth);
    },
    [width, minWidth, keyboardStep, getMaxWidth]
  );

  const handleDoubleClick = useCallback(() => {
    const defaultWidth = Math.round(window.innerWidth * DEFAULT_WIDTH_PERCENT);
    const maxWidth = getMaxWidth();
    onWidthChangeRef.current(clamp(defaultWidth, minWidth, maxWidth));
  }, [minWidth, getMaxWidth]);

  const maxWidth = getMaxWidth();
  const clampedWidth = clamp(width, minWidth, maxWidth);
  const valuePercent =
    maxWidth > minWidth ? Math.round(((clampedWidth - minWidth) / (maxWidth - minWidth)) * 100) : 0;

  const panelStyle: CSSProperties = {
    width: isOpen ? clampedWidth : 0,
  };

  /*
   * While dragging or settling, the panel should not have CSS transitions.
   * The className in the consumer checks `isDragging` — we extend that to
   * cover settling too.
   */
  const suppressTransition = isDragging || isSettling;

  const separatorProps = {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-valuenow': valuePercent,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-label': 'Resize diff panel',
    tabIndex: 0,
    onPointerDown: handlePointerDown,
    onKeyDown: handleKeyDown,
    onDoubleClick: handleDoubleClick,
    style: { touchAction: 'none' } satisfies CSSProperties,
    className: [
      'absolute left-0 top-0 bottom-0 w-2 -translate-x-1/2 cursor-col-resize z-10 max-sm:hidden',
      'before:absolute before:inset-y-0 before:left-1/2 before:-translate-x-1/2',
      'before:w-px before:bg-transparent',
      'hover:before:bg-accent focus-visible:before:bg-accent',
      'focus-visible:outline-none',
      isDragging ? 'before:w-0.5 before:bg-accent' : '',
    ].join(' '),
  };

  return {
    panelRef,
    separatorProps,
    panelStyle,
    isDragging: suppressTransition,
  };
}
