import { useHotkeys } from 'react-hotkeys-hook';

/** Global keyboard shortcuts for the Shipyard app. */
export function useAppHotkeys() {
  useHotkeys(
    'meta+j',
    () => {
      /** TODO: toggle terminal panel */
    },
    { preventDefault: true }
  );

  useHotkeys(
    'meta+shift+b',
    () => {
      /** TODO: toggle diff panel */
    },
    { preventDefault: true }
  );
}
