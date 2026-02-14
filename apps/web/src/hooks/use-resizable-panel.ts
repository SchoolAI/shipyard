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
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

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

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;

      const panel = panelRef.current;
      if (!panel) return;

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      panel.style.transition = 'none';

      dragStateRef.current = {
        initialClientX: e.clientX,
        initialWidth: width,
        currentWidth: width,
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
        setIsDragging(false);

        requestAnimationFrame(() => {
          panel.style.removeProperty('transition');
          panel.style.removeProperty('width');
        });

        onWidthChangeRef.current(finalWidth);
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', onPointerEnd);
      target.addEventListener('pointercancel', onPointerEnd);
    },
    [width, minWidth, getMaxWidth]
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
    style: { touchAction: 'none' } as CSSProperties,
    className: [
      'absolute left-0 top-0 bottom-0 w-2 -translate-x-1/2 cursor-col-resize z-10',
      'before:absolute before:inset-y-0 before:left-1/2 before:-translate-x-1/2',
      'before:w-px before:bg-transparent',
      'hover:before:bg-accent focus-visible:before:bg-accent',
      'focus-visible:outline-none',
      isDragging ? 'before:w-0.5 before:bg-accent' : '',
    ].join(' '),
  };

  return { panelRef, separatorProps, panelStyle, isDragging };
}
