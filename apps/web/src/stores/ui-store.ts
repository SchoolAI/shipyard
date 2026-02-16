import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type DiffScope = 'working-tree' | 'branch' | 'last-turn';
export type DiffViewType = 'split' | 'unified';
export type SidePanelId = 'diff' | 'plan' | 'deliverables';

export interface UIStore {
  isSidebarExpanded: boolean;
  isTerminalOpen: boolean;
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  isShortcutsModalOpen: boolean;
  selectedMachineId: string | null;
  selectedEnvironmentPath: string | null;
  theme: Theme;

  activeSidePanel: SidePanelId | null;
  sidePanelWidth: number;

  /** @deprecated Use activeSidePanel === 'diff' instead */
  isDiffOpen: boolean;
  /** @deprecated Use activeSidePanel === 'plan' instead */
  isPlanOpen: boolean;
  /** @deprecated Use sidePanelWidth instead */
  diffPanelWidth: number;
  /** @deprecated Use sidePanelWidth instead */
  planPanelWidth: number;

  diffWordWrap: boolean;
  diffScope: DiffScope;
  diffViewType: DiffViewType;
  diffLastViewedAt: number;
  isDiffFileTreeOpen: boolean;
  diffFileTreeWidth: number;
  showResolvedComments: boolean;
  terminalPanelHeight: number;

  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;

  setActiveSidePanel: (panel: SidePanelId | null) => void;
  toggleSidePanel: (panel: SidePanelId) => void;
  setSidePanelWidth: (width: number) => void;

  /** @deprecated Use toggleSidePanel('diff') instead */
  toggleDiff: () => void;
  /** @deprecated Use setActiveSidePanel(open ? 'diff' : null) instead */
  setDiffOpen: (open: boolean) => void;
  /** @deprecated Use toggleSidePanel('plan') instead */
  togglePlan: () => void;
  /** @deprecated Use setActiveSidePanel(open ? 'plan' : null) instead */
  setPlanOpen: (open: boolean) => void;
  /** @deprecated Use setSidePanelWidth instead */
  setDiffPanelWidth: (width: number) => void;
  /** @deprecated Use setSidePanelWidth instead */
  setPlanPanelWidth: (width: number) => void;

  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setShortcutsModalOpen: (open: boolean) => void;
  toggleShortcutsModal: () => void;
  setSelectedMachineId: (id: string | null) => void;
  setSelectedEnvironmentPath: (path: string | null) => void;
  setTheme: (theme: Theme) => void;
  setDiffWordWrap: (wrap: boolean) => void;
  setDiffScope: (scope: DiffScope) => void;
  setDiffViewType: (type: DiffViewType) => void;
  setDiffLastViewedAt: (ts: number) => void;
  setDiffFileTreeOpen: (open: boolean) => void;
  toggleDiffFileTree: () => void;
  setDiffFileTreeWidth: (width: number) => void;
  setShowResolvedComments: (show: boolean) => void;
  toggleResolvedComments: () => void;
  setTerminalPanelHeight: (height: number) => void;
}

const defaultPanelWidth = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.5) : 600;

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        isSidebarExpanded: true,
        isTerminalOpen: false,
        isSettingsOpen: false,
        isCommandPaletteOpen: false,
        isShortcutsModalOpen: false,
        selectedMachineId: null,
        selectedEnvironmentPath: null,
        theme: 'dark',

        activeSidePanel: null,
        sidePanelWidth: defaultPanelWidth,

        isDiffOpen: false,
        isPlanOpen: false,
        diffPanelWidth: defaultPanelWidth,
        planPanelWidth: defaultPanelWidth,

        diffWordWrap: false,
        diffScope: 'working-tree',
        diffViewType: 'unified',
        diffLastViewedAt: 0,
        isDiffFileTreeOpen: true,
        diffFileTreeWidth: 220,
        showResolvedComments: false,
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

        setActiveSidePanel: (panel) =>
          set(
            {
              activeSidePanel: panel,
              isDiffOpen: panel === 'diff',
              isPlanOpen: panel === 'plan',
            },
            undefined,
            'ui/setActiveSidePanel'
          ),

        toggleSidePanel: (panel) => {
          const current = get().activeSidePanel;
          const next = current === panel ? null : panel;
          get().setActiveSidePanel(next);
        },

        setSidePanelWidth: (width) => {
          const max = typeof window !== 'undefined' ? Math.floor(window.innerWidth * 0.8) : 1200;
          const clamped = Math.min(Math.max(width, 400), max);
          set(
            {
              sidePanelWidth: clamped,
              diffPanelWidth: clamped,
              planPanelWidth: clamped,
            },
            undefined,
            'ui/setSidePanelWidth'
          );
        },

        toggleDiff: () => get().toggleSidePanel('diff'),

        setDiffOpen: (open) => get().setActiveSidePanel(open ? 'diff' : null),

        togglePlan: () => get().toggleSidePanel('plan'),

        setPlanOpen: (open) => get().setActiveSidePanel(open ? 'plan' : null),

        setDiffPanelWidth: (width) => get().setSidePanelWidth(width),

        setPlanPanelWidth: (width) => get().setSidePanelWidth(width),

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

        setDiffLastViewedAt: (ts) =>
          set({ diffLastViewedAt: ts }, undefined, 'ui/setDiffLastViewedAt'),

        setDiffFileTreeOpen: (open) =>
          set({ isDiffFileTreeOpen: open }, undefined, 'ui/setDiffFileTreeOpen'),

        toggleDiffFileTree: () =>
          set(
            (state) => ({ isDiffFileTreeOpen: !state.isDiffFileTreeOpen }),
            undefined,
            'ui/toggleDiffFileTree'
          ),

        setDiffFileTreeWidth: (width) => {
          const clamped = Math.min(Math.max(width, 120), 400);
          set({ diffFileTreeWidth: clamped }, undefined, 'ui/setDiffFileTreeWidth');
        },

        setShowResolvedComments: (show) =>
          set({ showResolvedComments: show }, undefined, 'ui/setShowResolvedComments'),

        toggleResolvedComments: () =>
          set(
            (state) => ({ showResolvedComments: !state.showResolvedComments }),
            undefined,
            'ui/toggleResolvedComments'
          ),

        setTerminalPanelHeight: (height) => {
          const max = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.7) : 700;
          const clamped = Math.min(Math.max(height, 100), max);
          set({ terminalPanelHeight: clamped }, undefined, 'ui/setTerminalPanelHeight');
        },
      }),
      {
        name: 'shipyard-ui',
        version: 3,
        migrate: (persisted, version) => {
          // eslint-disable-next-line no-restricted-syntax -- zustand persist provides untyped state
          const state = persisted as Record<string, unknown>;
          if (version < 2) {
            state.isDiffFileTreeOpen ??= true;
            state.diffFileTreeWidth ??= 220;
          }
          if (version < 3) {
            state.activeSidePanel = null;
            const diffWidth =
              typeof state.diffPanelWidth === 'number' ? state.diffPanelWidth : undefined;
            const planWidth =
              typeof state.planPanelWidth === 'number' ? state.planPanelWidth : undefined;
            state.sidePanelWidth = diffWidth ?? planWidth ?? 600;
            state.showResolvedComments ??= false;
          }
          return state;
        },
        partialize: (state) => ({
          isSidebarExpanded: state.isSidebarExpanded,
          selectedMachineId: state.selectedMachineId,
          selectedEnvironmentPath: state.selectedEnvironmentPath,
          theme: state.theme,
          activeSidePanel: state.activeSidePanel,
          sidePanelWidth: state.sidePanelWidth,
          diffWordWrap: state.diffWordWrap,
          diffScope: state.diffScope,
          diffViewType: state.diffViewType,
          diffLastViewedAt: state.diffLastViewedAt,
          isDiffFileTreeOpen: state.isDiffFileTreeOpen,
          diffFileTreeWidth: state.diffFileTreeWidth,
          showResolvedComments: state.showResolvedComments,
          terminalPanelHeight: state.terminalPanelHeight,
        }),
      }
    ),
    { name: 'UIStore', store: 'ui' }
  )
);
