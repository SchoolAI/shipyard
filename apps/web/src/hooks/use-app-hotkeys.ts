import { useHotkeys } from 'react-hotkeys-hook';

interface AppHotkeyOptions {
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
}

/** Global keyboard shortcuts for the Shipyard app. */
export function useAppHotkeys({ onToggleTerminal, onToggleDiff }: AppHotkeyOptions) {
  useHotkeys('ctrl+`', onToggleTerminal, { preventDefault: true }, [onToggleTerminal]);

  useHotkeys('meta+shift+g', onToggleDiff, { preventDefault: true }, [onToggleDiff]);
}
