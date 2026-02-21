import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisualViewport } from './use-visual-viewport';

describe('useVisualViewport', () => {
  let listeners: Record<string, Set<EventListener>>;
  let mockViewport: {
    height: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    listeners = { resize: new Set() };
    mockViewport = {
      height: 800,
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event]?.add(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event]?.delete(cb);
      }),
    };
    Object.defineProperty(window, 'visualViewport', {
      value: mockViewport,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'ontouchstart', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    delete (window as unknown as Record<string, unknown>).ontouchstart;
  });

  it('returns the initial visual viewport height (floored)', () => {
    mockViewport.height = 800.7;
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBe(800);
  });

  it('updates when the viewport resizes (keyboard open/close)', () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBe(800);

    act(() => {
      mockViewport.height = 400.5;
      for (const cb of listeners.resize ?? []) cb(new Event('resize'));
    });

    expect(result.current).toBe(400);
  });

  it('skips re-render when floored height is unchanged', () => {
    mockViewport.height = 800.3;
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBe(800);

    act(() => {
      mockViewport.height = 800.9;
      for (const cb of listeners.resize ?? []) cb(new Event('resize'));
    });

    expect(result.current).toBe(800);
  });

  it('cleans up listeners on unmount', () => {
    const { unmount } = renderHook(() => useVisualViewport());
    unmount();
    expect(mockViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('returns null when visualViewport is not available', () => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBeNull();
  });

  it('returns null on non-touch (desktop) devices', () => {
    delete (window as unknown as Record<string, unknown>).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBeNull();
  });
});
