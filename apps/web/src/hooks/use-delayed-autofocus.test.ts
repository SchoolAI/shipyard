import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedAutofocus } from './use-delayed-autofocus';

function createMockRef() {
  const focus = vi.fn();
  return { current: { focus } } as React.RefObject<{ focus: () => void }>;
}

describe('useDelayedAutofocus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls focus after 3 seconds', () => {
    const ref = createMockRef();
    const { result } = renderHook(() => useDelayedAutofocus(ref));

    act(() => result.current.schedule());

    expect(ref.current!.focus).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));

    expect(ref.current!.focus).toHaveBeenCalledOnce();
  });

  it('resets the timer on rapid schedule calls (debounce)', () => {
    const ref = createMockRef();
    const { result } = renderHook(() => useDelayedAutofocus(ref));

    act(() => result.current.schedule());
    act(() => vi.advanceTimersByTime(600));

    act(() => result.current.schedule());
    act(() => vi.advanceTimersByTime(600));

    expect(ref.current!.focus).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));

    expect(ref.current!.focus).toHaveBeenCalledOnce();
  });

  it('cancel prevents focus from firing', () => {
    const ref = createMockRef();
    const { result } = renderHook(() => useDelayedAutofocus(ref));

    act(() => result.current.schedule());
    act(() => result.current.cancel());
    act(() => vi.advanceTimersByTime(5000));

    expect(ref.current!.focus).not.toHaveBeenCalled();
  });

  it('clears timer on unmount', () => {
    const ref = createMockRef();
    const { result, unmount } = renderHook(() => useDelayedAutofocus(ref));

    act(() => result.current.schedule());
    unmount();
    act(() => vi.advanceTimersByTime(5000));

    expect(ref.current!.focus).not.toHaveBeenCalled();
  });

  it('handles multiple schedule-cancel cycles', () => {
    const ref = createMockRef();
    const { result } = renderHook(() => useDelayedAutofocus(ref));

    act(() => result.current.schedule());
    act(() => result.current.cancel());

    act(() => result.current.schedule());
    act(() => vi.advanceTimersByTime(1000));

    expect(ref.current!.focus).toHaveBeenCalledOnce();
  });
});
