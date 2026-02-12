import { useHotkeys } from 'react-hotkeys-hook';

/** Global keyboard shortcuts for the Shipyard app. */
export function useAppHotkeys() {
  useHotkeys(
    'meta+`',
    () => {
      /** TODO: toggle terminal panel */
    },
    { preventDefault: true }
  );

  useHotkeys(
    'meta+shift+g',
    () => {
      /** TODO: toggle diff panel */
    },
    { preventDefault: true }
  );
}
