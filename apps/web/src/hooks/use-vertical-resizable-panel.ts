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

const MIN_HEIGHT = 100;
const MAX_HEIGHT_PERCENT = 0.7;
const DEFAULT_HEIGHT_PERCENT = 0.4;
const KEYBOARD_STEP = 20;

interface UseVerticalResizablePanelOptions {
  isOpen: boolean;
  height: number;
  onHeightChange: (height: number) => void;
  minHeight?: number;
  maxHeightPercent?: number;
  keyboardStep?: number;
}

interface UseVerticalResizablePanelReturn<T extends HTMLElement = HTMLElement> {
  panelRef: RefObject<T | null>;
  separatorProps: {
    role: 'separator';
    'aria-orientation': 'horizontal';
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

export function useVerticalResizablePanel<T extends HTMLElement = HTMLElement>({
  isOpen,
  height,
  onHeightChange,
  minHeight = MIN_HEIGHT,
  maxHeightPercent = MAX_HEIGHT_PERCENT,
  keyboardStep = KEYBOARD_STEP,
}: UseVerticalResizablePanelOptions): UseVerticalResizablePanelReturn<T> {
  const panelRef = useRef<T | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const onHeightChangeRef = useRef(onHeightChange);
  onHeightChangeRef.current = onHeightChange;

  const transitionRafRef = useRef<number | null>(null);

  const dragStateRef = useRef<{
    initialClientY: number;
    initialHeight: number;
    currentHeight: number;
    rafId: number | null;
  } | null>(null);

  const getMaxHeight = useCallback(
    () => Math.floor(window.innerHeight * maxHeightPercent),
    [maxHeightPercent]
  );

  useEffect(() => {
    return () => {
      const state = dragStateRef.current;
      if (state?.rafId != null) {
        cancelAnimationFrame(state.rafId);
      }
      dragStateRef.current = null;
      if (transitionRafRef.current != null) {
        cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;

      const panel = panelRef.current;
      if (!panel) return;

      const target = e.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      target.setPointerCapture(e.pointerId);

      if (transitionRafRef.current != null) {
        cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }

      panel.style.transition = 'none';

      const actualHeight = panel.getBoundingClientRect().height;

      dragStateRef.current = {
        initialClientY: e.clientY,
        initialHeight: actualHeight,
        currentHeight: actualHeight,
        rafId: null,
      };
      setIsDragging(true);

      const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        const delta = state.initialClientY - moveEvent.clientY;
        const clamped = clamp(state.initialHeight + delta, minHeight, getMaxHeight());
        state.currentHeight = clamped;

        if (state.rafId !== null) return;
        state.rafId = requestAnimationFrame(() => {
          if (dragStateRef.current) {
            panel.style.height = `${dragStateRef.current.currentHeight}px`;
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

        const finalHeight = state.currentHeight;
        dragStateRef.current = null;

        onHeightChangeRef.current(finalHeight);
        setIsDragging(false);

        transitionRafRef.current = requestAnimationFrame(() => {
          if (panelRef.current) {
            panelRef.current.style.removeProperty('transition');
          }
          transitionRafRef.current = null;
        });
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerEnd);
      target.addEventListener('pointercancel', onPointerEnd);
    },
    [minHeight, getMaxHeight]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const maxHeight = getMaxHeight();
      let newHeight: number | null = null;

      switch (e.key) {
        case 'ArrowUp':
          newHeight = clamp(height + keyboardStep, minHeight, maxHeight);
          break;
        case 'ArrowDown':
          newHeight = clamp(height - keyboardStep, minHeight, maxHeight);
          break;
        case 'Home':
          newHeight = maxHeight;
          break;
        case 'End':
          newHeight = minHeight;
          break;
        default:
          return;
      }

      e.preventDefault();
      onHeightChangeRef.current(newHeight);
    },
    [height, minHeight, keyboardStep, getMaxHeight]
  );

  const handleDoubleClick = useCallback(() => {
    const defaultHeight = Math.round(window.innerHeight * DEFAULT_HEIGHT_PERCENT);
    const maxHeight = getMaxHeight();
    onHeightChangeRef.current(clamp(defaultHeight, minHeight, maxHeight));
  }, [minHeight, getMaxHeight]);

  const maxHeight = getMaxHeight();
  const clampedHeight = clamp(height, minHeight, maxHeight);
  const valuePercent =
    maxHeight > minHeight
      ? Math.round(((clampedHeight - minHeight) / (maxHeight - minHeight)) * 100)
      : 0;

  const panelStyle: CSSProperties = {
    height: isOpen ? clampedHeight : 0,
  };

  const separatorProps = {
    role: 'separator' as const,
    'aria-orientation': 'horizontal' as const,
    'aria-valuenow': valuePercent,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-label': 'Resize terminal panel',
    tabIndex: 0,
    onPointerDown: handlePointerDown,
    onKeyDown: handleKeyDown,
    onDoubleClick: handleDoubleClick,
    style: { touchAction: 'none' } satisfies CSSProperties,
    className: [
      'absolute left-0 right-0 top-0 h-2 -translate-y-1/2 cursor-row-resize z-10 max-sm:hidden',
      'before:absolute before:inset-x-0 before:top-1/2 before:-translate-y-1/2',
      'before:h-px before:bg-transparent',
      'hover:before:bg-accent focus-visible:before:bg-accent',
      'focus-visible:outline-none',
      isDragging ? 'before:h-0.5 before:bg-accent' : '',
    ].join(' '),
  };

  return { panelRef, separatorProps, panelStyle, isDragging };
}
