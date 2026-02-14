import { useHotkeys } from 'react-hotkeys-hook';

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
}: AppHotkeyOptions) {
  useHotkeys('ctrl+backquote', onToggleTerminal, GLOBAL_OPTIONS, [onToggleTerminal]);

  useHotkeys('meta+alt+b', onToggleDiff, GLOBAL_OPTIONS, [onToggleDiff]);

  useHotkeys('meta+b', onToggleSidebar, GLOBAL_OPTIONS, [onToggleSidebar]);

  useHotkeys('meta+shift+n', onNewTask, GLOBAL_OPTIONS, [onNewTask]);

  useHotkeys('meta+comma', onOpenSettings, GLOBAL_OPTIONS, [onOpenSettings]);

  useHotkeys('meta+k', onCommandPalette, GLOBAL_OPTIONS, [onCommandPalette]);

  useHotkeys('j', onNavigateNextTask, NON_INPUT_OPTIONS, [onNavigateNextTask]);

  useHotkeys('k', onNavigatePrevTask, NON_INPUT_OPTIONS, [onNavigatePrevTask]);

  useHotkeys('e', onFocusComposer, NON_INPUT_OPTIONS, [onFocusComposer]);
  useHotkeys('/', onFocusComposer, NON_INPUT_OPTIONS, [onFocusComposer]);
}
