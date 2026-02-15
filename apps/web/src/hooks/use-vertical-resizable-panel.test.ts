import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVerticalResizablePanel } from './use-vertical-resizable-panel';

/** Stub window.innerHeight so getMaxHeight is deterministic */
function setInnerHeight(h: number) {
  Object.defineProperty(window, 'innerHeight', { value: h, writable: true, configurable: true });
}

beforeEach(() => {
  setInnerHeight(1000);
  vi.restoreAllMocks();
});

describe('useVerticalResizablePanel', () => {
  describe('returned interface', () => {
    it('returns panelRef, separatorProps, panelStyle, and isDragging', () => {
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 300,
          onHeightChange: vi.fn(),
        })
      );

      expect(result.current.panelRef).toBeDefined();
      expect(result.current.separatorProps).toBeDefined();
      expect(result.current.panelStyle).toBeDefined();
      expect(result.current.isDragging).toBe(false);
    });

    it('sets panelStyle height to the clamped value when open', () => {
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 300,
          onHeightChange: vi.fn(),
        })
      );

      expect(result.current.panelStyle).toEqual({ height: 300 });
    });

    it('sets panelStyle height to 0 when closed', () => {
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: false,
          height: 300,
          onHeightChange: vi.fn(),
        })
      );

      expect(result.current.panelStyle).toEqual({ height: 0 });
    });
  });

  describe('separator ARIA props', () => {
    it('has role separator with horizontal orientation', () => {
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 300,
          onHeightChange: vi.fn(),
        })
      );

      const sep = result.current.separatorProps;
      expect(sep.role).toBe('separator');
      expect(sep['aria-orientation']).toBe('horizontal');
      expect(sep['aria-label']).toBe('Resize terminal panel');
      expect(sep.tabIndex).toBe(0);
      expect(sep['aria-valuemin']).toBe(0);
      expect(sep['aria-valuemax']).toBe(100);
    });

    it('computes aria-valuenow as percentage between min and max', () => {
      // With default minHeight=100, maxHeight=700 (0.7 * 1000), height=400
      // percent = (400-100)/(700-100) * 100 = 50
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 400,
          onHeightChange: vi.fn(),
        })
      );

      expect(result.current.separatorProps['aria-valuenow']).toBe(50);
    });
  });

  describe('min/max constraints', () => {
    it('clamps height to minHeight when below', () => {
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 50,
          onHeightChange: vi.fn(),
          minHeight: 100,
        })
      );

      expect(result.current.panelStyle).toEqual({ height: 100 });
    });

    it('clamps height to maxHeight when above', () => {
      // maxHeight = 0.7 * 1000 = 700
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 900,
          onHeightChange: vi.fn(),
        })
      );

      expect(result.current.panelStyle).toEqual({ height: 700 });
    });

    it('respects custom minHeight', () => {
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 100,
          onHeightChange: vi.fn(),
          minHeight: 200,
        })
      );

      expect(result.current.panelStyle).toEqual({ height: 200 });
    });

    it('respects custom maxHeightPercent', () => {
      // maxHeight = 0.5 * 1000 = 500
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 600,
          onHeightChange: vi.fn(),
          maxHeightPercent: 0.5,
        })
      );

      expect(result.current.panelStyle).toEqual({ height: 500 });
    });

    it('returns 0 percent when min equals max', () => {
      // With minHeight = maxHeight (e.g. maxHeightPercent such that max = min)
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 100,
          onHeightChange: vi.fn(),
          minHeight: 100,
          maxHeightPercent: 0.1, // max = 100, equal to min
        })
      );

      expect(result.current.separatorProps['aria-valuenow']).toBe(0);
    });
  });

  describe('keyboard interaction', () => {
    function callKeyDown(key: string, height: number) {
      const onHeightChange = vi.fn();
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height,
          onHeightChange,
        })
      );

      const preventDefault = vi.fn();
      act(() => {
        result.current.separatorProps.onKeyDown({
          key,
          preventDefault,
        } as unknown as React.KeyboardEvent);
      });

      return { onHeightChange, preventDefault };
    }

    it('ArrowUp increases height by keyboardStep (default 20)', () => {
      const { onHeightChange, preventDefault } = callKeyDown('ArrowUp', 300);
      expect(onHeightChange).toHaveBeenCalledWith(320);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('ArrowDown decreases height by keyboardStep', () => {
      const { onHeightChange, preventDefault } = callKeyDown('ArrowDown', 300);
      expect(onHeightChange).toHaveBeenCalledWith(280);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('Home sets height to maxHeight', () => {
      // maxHeight = 0.7 * 1000 = 700
      const { onHeightChange } = callKeyDown('Home', 300);
      expect(onHeightChange).toHaveBeenCalledWith(700);
    });

    it('End sets height to minHeight', () => {
      const { onHeightChange } = callKeyDown('End', 300);
      expect(onHeightChange).toHaveBeenCalledWith(100);
    });

    it('ignores unrecognized keys', () => {
      const { onHeightChange, preventDefault } = callKeyDown('Tab', 300);
      expect(onHeightChange).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('clamps ArrowDown at minHeight', () => {
      const { onHeightChange } = callKeyDown('ArrowDown', 110);
      expect(onHeightChange).toHaveBeenCalledWith(100);
    });

    it('clamps ArrowUp at maxHeight', () => {
      const { onHeightChange } = callKeyDown('ArrowUp', 690);
      expect(onHeightChange).toHaveBeenCalledWith(700);
    });

    it('respects custom keyboardStep', () => {
      const onHeightChange = vi.fn();
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 300,
          onHeightChange,
          keyboardStep: 50,
        })
      );

      act(() => {
        result.current.separatorProps.onKeyDown({
          key: 'ArrowUp',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent);
      });

      expect(onHeightChange).toHaveBeenCalledWith(350);
    });
  });

  describe('double click', () => {
    it('resets to default height percent on double click', () => {
      const onHeightChange = vi.fn();
      const { result } = renderHook(() =>
        useVerticalResizablePanel({
          isOpen: true,
          height: 200,
          onHeightChange,
        })
      );

      act(() => {
        // onDoubleClick is on separatorProps
        // eslint-disable-next-line no-restricted-syntax -- test: accessing untyped event handler on separator props
        const props = result.current.separatorProps as Record<string, unknown>;
        if (typeof props.onDoubleClick === 'function') props.onDoubleClick();
      });

      // default = Math.round(1000 * 0.4) = 400, clamped to [100, 700]
      expect(onHeightChange).toHaveBeenCalledWith(400);
    });
  });
});
