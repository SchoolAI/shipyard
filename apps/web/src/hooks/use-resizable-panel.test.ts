import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResizablePanel } from './use-resizable-panel';

function setInnerWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, writable: true, configurable: true });
}

beforeEach(() => {
  setInnerWidth(1920);
  vi.restoreAllMocks();
});

describe('useResizablePanel', () => {
  it('exports the hook', () => {
    expect(useResizablePanel).toBeDefined();
  });

  describe('returned interface', () => {
    it('returns panelRef, separatorProps, panelStyle, and isDragging', () => {
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 600,
          onWidthChange: vi.fn(),
        })
      );

      expect(result.current.panelRef).toBeDefined();
      expect(result.current.separatorProps).toBeDefined();
      expect(result.current.panelStyle).toBeDefined();
      expect(result.current.isDragging).toBe(false);
    });

    it('sets panelStyle width to the clamped value when open', () => {
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 600,
          onWidthChange: vi.fn(),
        })
      );

      expect(result.current.panelStyle).toEqual({ width: 600 });
    });

    it('sets panelStyle width to 0 when closed', () => {
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: false,
          width: 600,
          onWidthChange: vi.fn(),
        })
      );

      expect(result.current.panelStyle).toEqual({ width: 0 });
    });
  });

  describe('separator ARIA props', () => {
    it('has role separator with vertical orientation', () => {
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 600,
          onWidthChange: vi.fn(),
        })
      );

      const sep = result.current.separatorProps;
      expect(sep.role).toBe('separator');
      expect(sep['aria-orientation']).toBe('vertical');
      expect(sep['aria-label']).toBe('Resize diff panel');
      expect(sep.tabIndex).toBe(0);
      expect(sep['aria-valuemin']).toBe(0);
      expect(sep['aria-valuemax']).toBe(100);
    });

    it('computes aria-valuenow as percentage between min and max', () => {
      // minWidth=400, maxWidth=0.8*1920=1536, width=968
      // percent = (968-400)/(1536-400) * 100 = 50
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 968,
          onWidthChange: vi.fn(),
        })
      );

      expect(result.current.separatorProps['aria-valuenow']).toBe(50);
    });
  });

  describe('min/max constraints', () => {
    it('clamps width to minWidth when below', () => {
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 200,
          onWidthChange: vi.fn(),
          minWidth: 400,
        })
      );

      expect(result.current.panelStyle).toEqual({ width: 400 });
    });

    it('clamps width to maxWidth when above', () => {
      // maxWidth = 0.8 * 1920 = 1536
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 2000,
          onWidthChange: vi.fn(),
        })
      );

      expect(result.current.panelStyle).toEqual({ width: 1536 });
    });

    it('respects custom minWidth', () => {
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 300,
          onWidthChange: vi.fn(),
          minWidth: 500,
        })
      );

      expect(result.current.panelStyle).toEqual({ width: 500 });
    });

    it('respects custom maxWidthPercent', () => {
      // maxWidth = 0.5 * 1920 = 960
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 1200,
          onWidthChange: vi.fn(),
          maxWidthPercent: 0.5,
        })
      );

      expect(result.current.panelStyle).toEqual({ width: 960 });
    });

    it('returns 0 percent when min equals max', () => {
      setInnerWidth(500);
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 400,
          onWidthChange: vi.fn(),
          minWidth: 400,
          maxWidthPercent: 0.8, // max = 400, equal to min
        })
      );

      expect(result.current.separatorProps['aria-valuenow']).toBe(0);
    });
  });

  describe('keyboard interaction', () => {
    function callKeyDown(key: string, width: number) {
      const onWidthChange = vi.fn();
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width,
          onWidthChange,
        })
      );

      const preventDefault = vi.fn();
      act(() => {
        result.current.separatorProps.onKeyDown({
          key,
          preventDefault,
        } as unknown as React.KeyboardEvent);
      });

      return { onWidthChange, preventDefault };
    }

    it('ArrowLeft increases width by keyboardStep (default 20)', () => {
      const { onWidthChange, preventDefault } = callKeyDown('ArrowLeft', 600);
      expect(onWidthChange).toHaveBeenCalledWith(620);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('ArrowRight decreases width by keyboardStep', () => {
      const { onWidthChange, preventDefault } = callKeyDown('ArrowRight', 600);
      expect(onWidthChange).toHaveBeenCalledWith(580);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('Home sets width to minWidth', () => {
      const { onWidthChange } = callKeyDown('Home', 600);
      expect(onWidthChange).toHaveBeenCalledWith(400);
    });

    it('End sets width to maxWidth', () => {
      // maxWidth = 0.8 * 1920 = 1536
      const { onWidthChange } = callKeyDown('End', 600);
      expect(onWidthChange).toHaveBeenCalledWith(1536);
    });

    it('ignores unrecognized keys', () => {
      const { onWidthChange, preventDefault } = callKeyDown('Tab', 600);
      expect(onWidthChange).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('clamps ArrowRight at minWidth', () => {
      const { onWidthChange } = callKeyDown('ArrowRight', 410);
      expect(onWidthChange).toHaveBeenCalledWith(400);
    });

    it('clamps ArrowLeft at maxWidth', () => {
      // maxWidth = 0.8 * 1920 = 1536
      const { onWidthChange } = callKeyDown('ArrowLeft', 1530);
      expect(onWidthChange).toHaveBeenCalledWith(1536);
    });

    it('respects custom keyboardStep', () => {
      const onWidthChange = vi.fn();
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 600,
          onWidthChange,
          keyboardStep: 50,
        })
      );

      act(() => {
        result.current.separatorProps.onKeyDown({
          key: 'ArrowLeft',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(onWidthChange).toHaveBeenCalledWith(650);
    });
  });

  describe('double click', () => {
    it('resets to default width percent on double click', () => {
      const onWidthChange = vi.fn();
      const { result } = renderHook(() =>
        useResizablePanel({
          isOpen: true,
          width: 500,
          onWidthChange,
        })
      );

      act(() => {
        const props = result.current.separatorProps as Record<string, unknown>;
        if (typeof props.onDoubleClick === 'function') props.onDoubleClick();
      });

      // default = Math.round(1920 * 0.5) = 960, clamped to [400, 1536]
      expect(onWidthChange).toHaveBeenCalledWith(960);
    });
  });
});
