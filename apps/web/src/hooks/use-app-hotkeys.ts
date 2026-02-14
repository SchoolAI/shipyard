import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../constants/hotkeys';

interface AppHotkeyOptions {
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
  onToggleSidebar: () => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
  onCommandPalette: () => void;
  onNavigateNextTask: () => void;
  onNavigatePrevTask: () => void;
  onFocusComposer: () => void;
  onShowShortcuts: () => void;
}

const GLOBAL_OPTIONS = { preventDefault: true, enableOnFormTags: true } as const;
const NON_INPUT_OPTIONS = { preventDefault: true, enableOnFormTags: false } as const;

export function useAppHotkeys({
  onToggleTerminal,
  onToggleDiff,
  onToggleSidebar,
  onNewTask,
  onOpenSettings,
  onCommandPalette,
  onNavigateNextTask,
  onNavigatePrevTask,
  onFocusComposer,
  onShowShortcuts,
}: AppHotkeyOptions) {
  useHotkeys(HOTKEYS.toggleTerminal.key, onToggleTerminal, GLOBAL_OPTIONS, [onToggleTerminal]);

  useHotkeys(HOTKEYS.toggleDiff.key, onToggleDiff, GLOBAL_OPTIONS, [onToggleDiff]);

  useHotkeys(HOTKEYS.toggleSidebar.key, onToggleSidebar, GLOBAL_OPTIONS, [onToggleSidebar]);

  useHotkeys(HOTKEYS.newTask.key, onNewTask, NON_INPUT_OPTIONS, [onNewTask]);

  useHotkeys(HOTKEYS.settings.key, onOpenSettings, GLOBAL_OPTIONS, [onOpenSettings]);

  useHotkeys(HOTKEYS.commandPalette.key, onCommandPalette, GLOBAL_OPTIONS, [onCommandPalette]);

  useHotkeys(HOTKEYS.navigateNext.key, onNavigateNextTask, NON_INPUT_OPTIONS, [onNavigateNextTask]);

  useHotkeys(HOTKEYS.navigatePrev.key, onNavigatePrevTask, NON_INPUT_OPTIONS, [onNavigatePrevTask]);

  useHotkeys(HOTKEYS.focusComposer.key, onFocusComposer, NON_INPUT_OPTIONS, [onFocusComposer]);
  useHotkeys(HOTKEYS.focusComposerAlt.key, onFocusComposer, NON_INPUT_OPTIONS, [onFocusComposer]);

  useHotkeys(HOTKEYS.showShortcuts.key, onShowShortcuts, GLOBAL_OPTIONS, [onShowShortcuts]);
  useHotkeys(HOTKEYS.showShortcutsAlt.key, onShowShortcuts, NON_INPUT_OPTIONS, [onShowShortcuts]);
}
