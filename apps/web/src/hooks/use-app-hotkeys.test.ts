import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}));

vi.mock('../stores', () => ({
  useUIStore: vi.fn(() => false),
}));

import { renderHook } from '@testing-library/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../constants/hotkeys';
import { useUIStore } from '../stores';
import { useAppHotkeys } from './use-app-hotkeys';

const mockUseHotkeys = vi.mocked(useHotkeys);
const mockUseUIStore = vi.mocked(useUIStore);

const GLOBAL_OPTIONS = { preventDefault: true, enableOnFormTags: true };
const NON_INPUT_OPTIONS = { preventDefault: true, enableOnFormTags: false, enabled: true };

function defaultCallbacks() {
  return {
    onToggleTerminal: vi.fn(),
    onToggleDiff: vi.fn(),
    onTogglePlan: vi.fn(),
    onToggleSidebar: vi.fn(),
    onNewTask: vi.fn(),
    onOpenSettings: vi.fn(),
    onCommandPalette: vi.fn(),
    onNavigateNextTask: vi.fn(),
    onNavigatePrevTask: vi.fn(),
    onFocusComposer: vi.fn(),
    onShowShortcuts: vi.fn(),
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

      const call = findCall(HOTKEYS.toggleTerminal.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onToggleTerminal);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+alt+b for diff toggle', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.toggleDiff.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onToggleDiff);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+b for sidebar toggle', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.toggleSidebar.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onToggleSidebar);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+comma for settings', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.settings.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onOpenSettings);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+k for command palette', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.commandPalette.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onCommandPalette);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+alt+p for plan toggle', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.togglePlan.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onTogglePlan);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });

    it('registers meta+slash for show shortcuts', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.showShortcuts.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onShowShortcuts);
      expect(call?.[2]).toEqual(GLOBAL_OPTIONS);
    });
  });

  describe('non-input shortcuts (disabled in form tags)', () => {
    it('registers c for new task', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.newTask.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onNewTask);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers j for navigate next task', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.navigateNext.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onNavigateNextTask);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers k for navigate prev task', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.navigatePrev.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onNavigatePrevTask);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers e for focus composer', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.focusComposer.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onFocusComposer);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers slash for focus composer', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.focusComposerAlt.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onFocusComposer);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });

    it('registers shift+/ for show shortcuts', () => {
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const call = findCall(HOTKEYS.showShortcutsAlt.key);
      expect(call).toBeDefined();
      expect(call?.[1]).toBe(cbs.onShowShortcuts);
      expect(call?.[2]).toEqual(NON_INPUT_OPTIONS);
    });
  });

  describe('overlay guard', () => {
    it('disables non-input hotkeys when an overlay is open', () => {
      mockUseUIStore.mockImplementation(() => true as ReturnType<typeof useUIStore>);
      const cbs = defaultCallbacks();
      renderHook(() => useAppHotkeys(cbs));

      const disabledOpts = { preventDefault: true, enableOnFormTags: false, enabled: false };

      expect(findCall(HOTKEYS.newTask.key)?.[2]).toEqual(disabledOpts);
      expect(findCall(HOTKEYS.navigateNext.key)?.[2]).toEqual(disabledOpts);
      expect(findCall(HOTKEYS.navigatePrev.key)?.[2]).toEqual(disabledOpts);
      expect(findCall(HOTKEYS.focusComposer.key)?.[2]).toEqual(disabledOpts);
      expect(findCall(HOTKEYS.focusComposerAlt.key)?.[2]).toEqual(disabledOpts);
      expect(findCall(HOTKEYS.showShortcutsAlt.key)?.[2]).toEqual(disabledOpts);

      expect(findCall(HOTKEYS.toggleTerminal.key)?.[2]).toEqual(GLOBAL_OPTIONS);
      expect(findCall(HOTKEYS.commandPalette.key)?.[2]).toEqual(GLOBAL_OPTIONS);
      expect(findCall(HOTKEYS.showShortcuts.key)?.[2]).toEqual(GLOBAL_OPTIONS);

      mockUseUIStore.mockImplementation(() => false as ReturnType<typeof useUIStore>);
    });
  });
});
