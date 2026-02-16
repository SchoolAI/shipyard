import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../constants/hotkeys';
import { useUIStore } from '../stores';

interface AppHotkeyOptions {
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
  onTogglePlan: () => void;
  onToggleSidebar: () => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
  onCommandPalette: () => void;
  onNavigateNextTask: () => void;
  onNavigatePrevTask: () => void;
  onFocusComposer: () => void;
  onShowShortcuts: () => void;
  onToggleVoiceInput: () => void;
}

const GLOBAL_OPTIONS = { preventDefault: true, enableOnFormTags: true } as const;

export function useAppHotkeys({
  onToggleTerminal,
  onToggleDiff,
  onTogglePlan,
  onToggleSidebar,
  onNewTask,
  onOpenSettings,
  onCommandPalette,
  onNavigateNextTask,
  onNavigatePrevTask,
  onFocusComposer,
  onShowShortcuts,
  onToggleVoiceInput,
}: AppHotkeyOptions) {
  const isOverlayOpen = useUIStore(
    (s) => s.isCommandPaletteOpen || s.isShortcutsModalOpen || s.isSettingsOpen
  );

  const nonInputOptions = useMemo(
    () => ({ preventDefault: true, enableOnFormTags: false as const, enabled: !isOverlayOpen }),
    [isOverlayOpen]
  );

  useHotkeys(HOTKEYS.toggleTerminal.key, onToggleTerminal, GLOBAL_OPTIONS, [onToggleTerminal]);

  useHotkeys(HOTKEYS.toggleDiff.key, onToggleDiff, GLOBAL_OPTIONS, [onToggleDiff]);

  useHotkeys(HOTKEYS.togglePlan.key, onTogglePlan, GLOBAL_OPTIONS, [onTogglePlan]);

  useHotkeys(HOTKEYS.toggleSidebar.key, onToggleSidebar, GLOBAL_OPTIONS, [onToggleSidebar]);

  useHotkeys(HOTKEYS.newTask.key, onNewTask, nonInputOptions, [onNewTask, isOverlayOpen]);

  useHotkeys(HOTKEYS.settings.key, onOpenSettings, GLOBAL_OPTIONS, [onOpenSettings]);

  useHotkeys(HOTKEYS.commandPalette.key, onCommandPalette, GLOBAL_OPTIONS, [onCommandPalette]);

  useHotkeys(HOTKEYS.navigateNext.key, onNavigateNextTask, nonInputOptions, [
    onNavigateNextTask,
    isOverlayOpen,
  ]);

  useHotkeys(HOTKEYS.navigatePrev.key, onNavigatePrevTask, nonInputOptions, [
    onNavigatePrevTask,
    isOverlayOpen,
  ]);

  useHotkeys(HOTKEYS.focusComposer.key, onFocusComposer, nonInputOptions, [
    onFocusComposer,
    isOverlayOpen,
  ]);
  useHotkeys(HOTKEYS.focusComposerAlt.key, onFocusComposer, nonInputOptions, [
    onFocusComposer,
    isOverlayOpen,
  ]);

  useHotkeys(HOTKEYS.showShortcuts.key, onShowShortcuts, GLOBAL_OPTIONS, [onShowShortcuts]);
  useHotkeys(HOTKEYS.showShortcutsAlt.key, onShowShortcuts, nonInputOptions, [
    onShowShortcuts,
    isOverlayOpen,
  ]);

  useHotkeys(HOTKEYS.voiceInput.key, onToggleVoiceInput, GLOBAL_OPTIONS, [onToggleVoiceInput]);
}
