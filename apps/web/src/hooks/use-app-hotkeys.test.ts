import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}));

import { renderHook } from '@testing-library/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useAppHotkeys } from './use-app-hotkeys';

const mockUseHotkeys = vi.mocked(useHotkeys);

describe('useAppHotkeys', () => {
  beforeEach(() => {
    mockUseHotkeys.mockClear();
  });

  it('registers ctrl+backquote for terminal toggle', () => {
    const onToggleTerminal = vi.fn();
    const onToggleDiff = vi.fn();
    renderHook(() => useAppHotkeys({ onToggleTerminal, onToggleDiff }));

    const terminalCall = mockUseHotkeys.mock.calls.find((c) => c[0] === 'ctrl+backquote');
    expect(terminalCall).toBeDefined();
    expect(terminalCall?.[1]).toBe(onToggleTerminal);
    expect(terminalCall?.[2]).toEqual({ preventDefault: true });
  });

  it('registers meta+shift+g for diff toggle', () => {
    const onToggleTerminal = vi.fn();
    const onToggleDiff = vi.fn();
    renderHook(() => useAppHotkeys({ onToggleTerminal, onToggleDiff }));

    const diffCall = mockUseHotkeys.mock.calls.find((c) => c[0] === 'meta+shift+g');
    expect(diffCall).toBeDefined();
    expect(diffCall?.[1]).toBe(onToggleDiff);
    expect(diffCall?.[2]).toEqual({ preventDefault: true });
  });
});
