import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../stores', () => ({
  useUIStore: vi.fn(() => false),
}));

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useUIStore } from '../stores';
import {
  FOCUS_PRIORITY,
  FocusHierarchyProvider,
  useFocusHierarchy,
  useFocusTarget,
} from './use-focus-hierarchy';

const mockUseUIStore = vi.mocked(useUIStore);

function createMockRef() {
  const focus = vi.fn();
  return { current: { focus } };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <FocusHierarchyProvider>{children}</FocusHierarchyProvider>;
}

describe('useFocusHierarchy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    mockUseUIStore.mockImplementation(() => false as ReturnType<typeof useUIStore>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('focuses the highest-priority active target', () => {
    const lowRef = createMockRef();
    const highRef = createMockRef();

    renderHook(
      () => {
        useFocusTarget({
          id: 'low',
          ref: lowRef,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        useFocusTarget({
          id: 'high',
          ref: highRef,
          priority: FOCUS_PRIORITY.PERMISSION,
        });
      },
      { wrapper: Wrapper }
    );

    expect(highRef.current?.focus).toHaveBeenCalled();
    expect(lowRef.current?.focus).not.toHaveBeenCalled();
  });

  it('skips targets with active: false', () => {
    const lowRef = createMockRef();
    const highRef = createMockRef();

    renderHook(
      () => {
        useFocusTarget({
          id: 'low',
          ref: lowRef,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        useFocusTarget({
          id: 'high',
          ref: highRef,
          priority: FOCUS_PRIORITY.PERMISSION,
          active: false,
        });
      },
      { wrapper: Wrapper }
    );

    expect(lowRef.current?.focus).toHaveBeenCalled();
    expect(highRef.current?.focus).not.toHaveBeenCalled();
  });

  it('scheduleFocus fires after delay', () => {
    const ref = createMockRef();

    const { result } = renderHook(
      () => {
        useFocusTarget({
          id: 'composer',
          ref,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper }
    );

    ref.current?.focus.mockClear();

    act(() => result.current.scheduleFocus('composer', 1000));

    expect(ref.current?.focus).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));

    expect(ref.current?.focus).toHaveBeenCalledOnce();
  });

  it('higher-priority registration cancels pending scheduleFocus', () => {
    const composerRef = createMockRef();
    const permRef = createMockRef();

    const { result, rerender } = renderHook(
      ({ permissionActive }: { permissionActive: boolean }) => {
        useFocusTarget({
          id: 'composer',
          ref: composerRef,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        useFocusTarget({
          id: 'permission',
          ref: permRef,
          priority: FOCUS_PRIORITY.PERMISSION,
          active: permissionActive,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper, initialProps: { permissionActive: false } }
    );

    composerRef.current?.focus.mockClear();
    permRef.current?.focus.mockClear();

    act(() => result.current.scheduleFocus('composer', 1000));

    // Permission card becomes active during the delay
    rerender({ permissionActive: true });

    // Advance past the scheduled delay
    act(() => vi.advanceTimersByTime(1500));

    // Permission should have focus (re-evaluation cleared pending and focused winner)
    expect(permRef.current?.focus).toHaveBeenCalled();
  });

  it('focusTarget forces immediate focus on a specific target', () => {
    const lowRef = createMockRef();
    const highRef = createMockRef();

    const { result } = renderHook(
      () => {
        useFocusTarget({
          id: 'low',
          ref: lowRef,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        useFocusTarget({
          id: 'high',
          ref: highRef,
          priority: FOCUS_PRIORITY.PERMISSION,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper }
    );

    lowRef.current?.focus.mockClear();
    highRef.current?.focus.mockClear();

    act(() => result.current.focusTarget('low'));

    expect(lowRef.current?.focus).toHaveBeenCalledOnce();
  });

  it('cancelPending stops delayed focus', () => {
    const ref = createMockRef();

    const { result } = renderHook(
      () => {
        useFocusTarget({
          id: 'composer',
          ref,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper }
    );

    ref.current?.focus.mockClear();

    act(() => result.current.scheduleFocus('composer', 1000));
    act(() => result.current.cancelPending());
    act(() => vi.advanceTimersByTime(2000));

    expect(ref.current?.focus).not.toHaveBeenCalled();
  });

  it('overlay pause prevents focus', () => {
    mockUseUIStore.mockImplementation(() => true as ReturnType<typeof useUIStore>);

    const ref = createMockRef();

    renderHook(
      () => {
        useFocusTarget({
          id: 'composer',
          ref,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
      },
      { wrapper: Wrapper }
    );

    expect(ref.current?.focus).not.toHaveBeenCalled();
  });

  it('cleanup on unmount cancels timers', () => {
    const ref = createMockRef();

    const { result, unmount } = renderHook(
      () => {
        useFocusTarget({
          id: 'composer',
          ref,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper }
    );

    ref.current?.focus.mockClear();

    act(() => result.current.scheduleFocus('composer', 1000));
    unmount();
    act(() => vi.advanceTimersByTime(2000));

    expect(ref.current?.focus).not.toHaveBeenCalled();
  });

  it('version bump from same-priority target does not cancel scheduleFocus', () => {
    const composerRef = createMockRef();
    const permRef = createMockRef();

    const { result, rerender } = renderHook(
      ({ permissionActive }: { permissionActive: boolean }) => {
        useFocusTarget({
          id: 'composer',
          ref: composerRef,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        useFocusTarget({
          id: 'permission',
          ref: permRef,
          priority: FOCUS_PRIORITY.PERMISSION,
          active: permissionActive,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper, initialProps: { permissionActive: true } }
    );

    composerRef.current?.focus.mockClear();
    permRef.current?.focus.mockClear();

    act(() => result.current.scheduleFocus('composer', 1000));

    // Permission card deactivates during the delay (same priority landscape
    // change but winner is still the scheduled target — should NOT cancel)
    rerender({ permissionActive: false });

    // Focus should NOT have fired yet
    expect(composerRef.current?.focus).not.toHaveBeenCalled();

    // After the full delay, the scheduled focus fires
    act(() => vi.advanceTimersByTime(1000));

    expect(composerRef.current?.focus).toHaveBeenCalledOnce();
  });

  it('rapid scheduleFocus calls: only the last one fires', () => {
    const composerRef = createMockRef();

    const { result } = renderHook(
      () => {
        useFocusTarget({
          id: 'composer',
          ref: composerRef,
          priority: FOCUS_PRIORITY.COMPOSER,
        });
        return useFocusHierarchy();
      },
      { wrapper: Wrapper }
    );

    composerRef.current?.focus.mockClear();

    act(() => result.current.scheduleFocus('composer', 1000));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.scheduleFocus('composer', 1000));
    act(() => vi.advanceTimersByTime(500));

    expect(composerRef.current?.focus).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));

    expect(composerRef.current?.focus).toHaveBeenCalledOnce();
  });

  it('first registered target wins at same priority', () => {
    const ref1 = createMockRef();
    const ref2 = createMockRef();

    renderHook(
      () => {
        useFocusTarget({
          id: 'panel-1',
          ref: ref1,
          priority: FOCUS_PRIORITY.PANEL,
        });
        useFocusTarget({
          id: 'panel-2',
          ref: ref2,
          priority: FOCUS_PRIORITY.PANEL,
        });
      },
      { wrapper: Wrapper }
    );

    expect(ref1.current?.focus).toHaveBeenCalled();
  });
});
