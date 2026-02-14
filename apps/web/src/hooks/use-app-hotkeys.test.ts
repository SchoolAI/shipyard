import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}));

import { renderHook } from '@testing-library/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useAppHotkeys } from './use-app-hotkeys';

const mockUseHotkeys = vi.mocked(useHotkeys);

const GLOBAL_OPTIONS = { preventDefault: true, enableOnFormTags: true };
const NON_INPUT_OPTIONS = { preventDefault: true, enableOnFormTags: false };

function defaultCallbacks() {
  return {
    onToggleTerminal: vi.fn(),
    onToggleDiff: vi.fn(),
    onToggleSidebar: vi.fn(),
    onNewTask: vi.fn(),
    onOpenSettings: vi.fn(),
    onCommandPalette: vi.fn(),
    onNavigateNextTask: vi.fn(),
    onNavigatePrevTask: vi.fn(),
    onFocusComposer: vi.fn(),
  };
}

function findCall(key: string) {
  return mockUseHotkeys.mock.calls.find((c) => c[0] === key);
}

describe('useAppHotkeys', () => {
  beforeEach(() => {
    mockUseHotkeys.mockClear();
  });

  describe('global shortcuts (work in form tags)', () => {
    it('registers ctrl+backquote for terminal toggle', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('ctrl+backquote');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onToggleTerminal);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+alt+b for diff toggle', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('meta+alt+b');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onToggleDiff);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+b for sidebar toggle', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('meta+b');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onToggleSidebar);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+shift+n for new task', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('meta+shift+n');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onNewTask);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+comma for settings', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('meta+comma');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onOpenSettings);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+k for command palette', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('meta+k');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onCommandPalette);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });
  });

  describe('non-input shortcuts (disabled in form tags)', () => {
    it('registers j for navigate next task', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('j');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onNavigateNextTask);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers k for navigate prev task', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('k');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onNavigatePrevTask);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers e for focus composer', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('e');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onFocusComposer);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers / for focus composer', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall('/');
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onFocusComposer);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });
  });
});
