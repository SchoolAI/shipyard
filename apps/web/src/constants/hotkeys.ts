export type HotkeyContext = 'global' | 'navigation' | 'composer';

export interface HotkeyDef {
  key: string;
  label: string;
  display: string;
  description: string;
  context: HotkeyContext;
}

export const HOTKEYS = {
  toggleSidebar: {
    key: 'meta+b',
    label: 'Toggle Sidebar',
    display: '\u2318B',
    description: 'Show or hide the task sidebar',
    context: 'global',
  },
  toggleTerminal: {
    key: 'ctrl+backquote',
    label: 'Toggle Terminal',
    display: '\u2303`',
    description: 'Show or hide the terminal panel',
    context: 'global',
  },
  toggleDiff: {
    key: 'meta+alt+b',
    label: 'Toggle Diff Panel',
    display: '\u2318\u2325B',
    description: 'Show or hide the diff panel',
    context: 'global',
  },
  togglePlan: {
    key: 'meta+alt+p',
    label: 'Toggle Plan Panel',
    display: '\u2318\u2325P',
    description: 'Show or hide the plan panel',
    context: 'global',
  },
  newTask: {
    key: 'c',
    label: 'New Task',
    display: 'C',
    description: 'Create a new task',
    context: 'navigation',
  },
  settings: {
    key: 'meta+comma',
    label: 'Settings',
    display: '\u2318,',
    description: 'Open settings',
    context: 'global',
  },
  commandPalette: {
    key: 'meta+k',
    label: 'Command Palette',
    display: '\u2318K',
    description: 'Open command palette',
    context: 'global',
  },
  navigateNext: {
    key: 'j',
    label: 'Next Task',
    display: 'J',
    description: 'Navigate to next task',
    context: 'navigation',
  },
  navigatePrev: {
    key: 'k',
    label: 'Previous Task',
    display: 'K',
    description: 'Navigate to previous task',
    context: 'navigation',
  },
  focusComposer: {
    key: 'e',
    label: 'Focus Composer',
    display: 'E',
    description: 'Focus the message composer',
    context: 'navigation',
  },
  focusComposerAlt: {
    key: 'slash',
    label: 'Focus Composer',
    display: '/',
    description: 'Focus the message composer',
    context: 'navigation',
  },
  showShortcuts: {
    key: 'meta+slash',
    label: 'Keyboard Shortcuts',
    display: '\u2318/',
    description: 'Show keyboard shortcuts',
    context: 'global',
  },
  showShortcutsAlt: {
    key: 'shift+slash',
    label: 'Keyboard Shortcuts',
    display: '?',
    description: 'Show keyboard shortcuts',
    context: 'navigation',
  },
  stashPrompt: {
    key: 'meta+s',
    label: 'Stash / Unstash Prompt',
    display: '\u2318S',
    description: 'Toggle stash: save current input or restore stashed input',
    context: 'composer',
  },
} as const satisfies Record<string, HotkeyDef>;
