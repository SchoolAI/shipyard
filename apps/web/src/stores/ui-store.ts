import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type DiffScope = 'working-tree' | 'branch' | 'last-turn';
export type DiffViewType = 'split' | 'unified';

export interface UIStore {
  isSidebarExpanded: boolean;
  isTerminalOpen: boolean;
  isDiffOpen: boolean;
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  isShortcutsModalOpen: boolean;
  selectedMachineId: string | null;
  selectedEnvironmentPath: string | null;
  theme: Theme;
  diffPanelWidth: number;
  diffWordWrap: boolean;
  diffScope: DiffScope;
  diffViewType: DiffViewType;
  diffLastViewedAt: Record<DiffScope, number>;
  terminalPanelHeight: number;

  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;
  toggleDiff: () => void;
  setDiffOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setShortcutsModalOpen: (open: boolean) => void;
  toggleShortcutsModal: () => void;
  setSelectedMachineId: (id: string | null) => void;
  setSelectedEnvironmentPath: (path: string | null) => void;
  setTheme: (theme: Theme) => void;
  setDiffPanelWidth: (width: number) => void;
  setDiffWordWrap: (wrap: boolean) => void;
  setDiffScope: (scope: DiffScope) => void;
  setDiffViewType: (type: DiffViewType) => void;
  setDiffLastViewedAt: (scope: DiffScope, ts: number) => void;
  setTerminalPanelHeight: (height: number) => void;
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
        theme: 'dark',
        diffPanelWidth: typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.38) : 520,
        diffWordWrap: false,
        diffScope: 'working-tree',
        diffViewType: 'unified',
        diffLastViewedAt: { 'working-tree': 0, branch: 0, 'last-turn': 0 },
        terminalPanelHeight:
          typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.4) : 400,

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

        toggleSettings: () =>
          set(
            (state) => ({ isSettingsOpen: !state.isSettingsOpen }),
            undefined,
            'ui/toggleSettings'
          ),

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

        setTheme: (theme) => set({ theme }, undefined, 'ui/setTheme'),

        setDiffWordWrap: (wrap) => set({ diffWordWrap: wrap }, undefined, 'ui/setDiffWordWrap'),

        setDiffScope: (scope) => set({ diffScope: scope }, undefined, 'ui/setDiffScope'),

        setDiffViewType: (type) => set({ diffViewType: type }, undefined, 'ui/setDiffViewType'),

        setDiffLastViewedAt: (scope, ts) =>
          set(
            (state) => ({
              diffLastViewedAt: { ...state.diffLastViewedAt, [scope]: ts },
            }),
            undefined,
            'ui/setDiffLastViewedAt'
          ),

        setDiffPanelWidth: (width) => {
          const max = typeof window !== 'undefined' ? Math.floor(window.innerWidth * 0.8) : 1200;
          const clamped = Math.min(Math.max(width, 320), max);
          set({ diffPanelWidth: clamped }, undefined, 'ui/setDiffPanelWidth');
        },

        setTerminalPanelHeight: (height) => {
          const max = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.7) : 700;
          const clamped = Math.min(Math.max(height, 100), max);
          set({ terminalPanelHeight: clamped }, undefined, 'ui/setTerminalPanelHeight');
        },
      }),
      {
        name: 'shipyard-ui',
        version: 2,
        migrate: (persisted, version) => {
          const state = persisted as Record<string, unknown> as Partial<UIStore>;
          if (version < 2) {
            state.diffLastViewedAt = { 'working-tree': 0, branch: 0, 'last-turn': 0 };
          }
          return state as UIStore;
        },
        onRehydrateStorage: () => (state) => {
          if (!state || typeof window === 'undefined') return;

          const maxWidth = Math.floor(window.innerWidth * 0.8);
          const clampedWidth = Math.min(Math.max(state.diffPanelWidth, 320), maxWidth);
          if (clampedWidth !== state.diffPanelWidth) {
            state.setDiffPanelWidth(clampedWidth);
          }

          const maxHeight = Math.floor(window.innerHeight * 0.7);
          const clampedHeight = Math.min(Math.max(state.terminalPanelHeight, 100), maxHeight);
          if (clampedHeight !== state.terminalPanelHeight) {
            state.setTerminalPanelHeight(clampedHeight);
          }
        },
        partialize: (state) => ({
          isSidebarExpanded: state.isSidebarExpanded,
          selectedMachineId: state.selectedMachineId,
          selectedEnvironmentPath: state.selectedEnvironmentPath,
          theme: state.theme,
          diffPanelWidth: state.diffPanelWidth,
          diffWordWrap: state.diffWordWrap,
          diffScope: state.diffScope,
          diffViewType: state.diffViewType,
          diffLastViewedAt: state.diffLastViewedAt,
          terminalPanelHeight: state.terminalPanelHeight,
        }),
      }
    ),
    { name: 'UIStore', store: 'ui' }
  )
);
