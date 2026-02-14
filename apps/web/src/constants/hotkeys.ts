export interface HotkeyDef {
  key: string;
  label: string;
  display: string;
  description: string;
  global: boolean;
}

export const HOTKEYS = {
  toggleSidebar: {
    key: 'meta+b',
    label: 'Toggle Sidebar',
    display: '\u2318B',
    description: 'Show or hide the task sidebar',
    global: true,
  },
  toggleTerminal: {
    key: 'ctrl+backquote',
    label: 'Toggle Terminal',
    display: '\u2303`',
    description: 'Show or hide the terminal panel',
    global: true,
  },
  toggleDiff: {
    key: 'meta+alt+b',
    label: 'Toggle Diff Panel',
    display: '\u2318\u2325B',
    description: 'Show or hide the diff panel',
    global: true,
  },
  newTask: {
    key: 'c',
    label: 'New Task',
    display: 'C',
    description: 'Create a new task',
    global: false,
  },
  settings: {
    key: 'meta+comma',
    label: 'Settings',
    display: '\u2318,',
    description: 'Open settings',
    global: true,
  },
  commandPalette: {
    key: 'meta+k',
    label: 'Command Palette',
    display: '\u2318K',
    description: 'Open command palette',
    global: true,
  },
  navigateNext: {
    key: 'j',
    label: 'Next Task',
    display: 'J',
    description: 'Navigate to next task',
    global: false,
  },
  navigatePrev: {
    key: 'k',
    label: 'Previous Task',
    display: 'K',
    description: 'Navigate to previous task',
    global: false,
  },
  focusComposer: {
    key: 'e',
    label: 'Focus Composer',
    display: 'E',
    description: 'Focus the message composer',
    global: false,
  },
  focusComposerAlt: {
    key: 'slash',
    label: 'Focus Composer',
    display: '/',
    description: 'Focus the message composer',
    global: false,
  },
  showShortcuts: {
    key: 'meta+slash',
    label: 'Keyboard Shortcuts',
    display: '\u2318/',
    description: 'Show keyboard shortcuts',
    global: true,
  },
  showShortcutsAlt: {
    key: 'shift+slash',
    label: 'Keyboard Shortcuts',
    display: '?',
    description: 'Show keyboard shortcuts',
    global: false,
  },
} as const satisfies Record<string, HotkeyDef>;
