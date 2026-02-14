import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface UIStore {
  isSidebarExpanded: boolean;
  isTerminalOpen: boolean;
  isDiffOpen: boolean;
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  isShortcutsModalOpen: boolean;
  selectedMachineId: string | null;
  selectedEnvironmentPath: string | null;

  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  toggleDiff: () => void;
  setDiffOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setShortcutsModalOpen: (open: boolean) => void;
  toggleShortcutsModal: () => void;
  setSelectedMachineId: (id: string | null) => void;
  setSelectedEnvironmentPath: (path: string | null) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set) => ({
        isSidebarExpanded: true,
        isTerminalOpen: false,
        isDiffOpen: false,
        isSettingsOpen: false,
        isCommandPaletteOpen: false,
        isShortcutsModalOpen: false,
        selectedMachineId: null,
        selectedEnvironmentPath: null,

        toggleSidebar: () =>
          set(
            (state) => ({ isSidebarExpanded: !state.isSidebarExpanded }),
            undefined,
            'ui/toggleSidebar'
          ),

        setSidebarExpanded: (expanded) =>
          set({ isSidebarExpanded: expanded }, undefined, 'ui/setSidebarExpanded'),

        toggleTerminal: () =>
          set(
            (state) => ({ isTerminalOpen: !state.isTerminalOpen }),
            undefined,
            'ui/toggleTerminal'
          ),

        setTerminalOpen: (open) => set({ isTerminalOpen: open }, undefined, 'ui/setTerminalOpen'),

        toggleDiff: () =>
          set((state) => ({ isDiffOpen: !state.isDiffOpen }), undefined, 'ui/toggleDiff'),

        setDiffOpen: (open) => set({ isDiffOpen: open }, undefined, 'ui/setDiffOpen'),

        setSettingsOpen: (open) => set({ isSettingsOpen: open }, undefined, 'ui/setSettingsOpen'),

        setCommandPaletteOpen: (open) =>
          set({ isCommandPaletteOpen: open }, undefined, 'ui/setCommandPaletteOpen'),

        toggleCommandPalette: () =>
          set(
            (state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen }),
            undefined,
            'ui/toggleCommandPalette'
          ),

        setShortcutsModalOpen: (open) =>
          set({ isShortcutsModalOpen: open }, undefined, 'ui/setShortcutsModalOpen'),

        toggleShortcutsModal: () =>
          set(
            (state) => ({ isShortcutsModalOpen: !state.isShortcutsModalOpen }),
            undefined,
            'ui/toggleShortcutsModal'
          ),

        setSelectedMachineId: (id) =>
          set({ selectedMachineId: id }, undefined, 'ui/setSelectedMachineId'),

        setSelectedEnvironmentPath: (path) =>
          set({ selectedEnvironmentPath: path }, undefined, 'ui/setSelectedEnvironmentPath'),
      }),
      {
        name: 'shipyard-ui',
        partialize: (state) => ({
          isSidebarExpanded: state.isSidebarExpanded,
          selectedMachineId: state.selectedMachineId,
          selectedEnvironmentPath: state.selectedEnvironmentPath,
        }),
      }
    ),
    { name: 'UIStore', store: 'ui' }
  )
);
