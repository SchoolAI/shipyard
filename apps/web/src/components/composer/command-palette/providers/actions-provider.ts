import { GitCompareArrows, Keyboard, PanelLeftClose, Plus, Settings, Terminal } from 'lucide-react';
import { HOTKEYS } from '../../../../constants/hotkeys';
import { useTaskStore } from '../../../../stores/task-store';
import { useUIStore } from '../../../../stores/ui-store';
import { fuzzyScore } from '../../../../utils/fuzzy-match';
import type { CommandContext, CommandItem, CommandProvider } from '../types';

interface ActionDef {
  id: string;
  label: string;
  icon: typeof Plus;
  keywords: string[];
  shortcut: string;
  onSelect: (close: () => void) => void;
}

const ACTIONS: ActionDef[] = [
  {
    id: 'action:new-task',
    label: 'New Task',
    icon: Plus,
    keywords: ['create', 'add', 'task'],
    shortcut: HOTKEYS.newTask.display,
    onSelect: (close) => {
      useTaskStore.getState().setActiveTask(null);
      close();
    },
  },
  {
    id: 'action:toggle-terminal',
    label: 'Toggle Terminal',
    icon: Terminal,
    keywords: ['terminal', 'console', 'shell'],
    shortcut: HOTKEYS.toggleTerminal.display,
    onSelect: (close) => {
      useUIStore.getState().toggleTerminal();
      close();
    },
  },
  {
    id: 'action:toggle-diff',
    label: 'Toggle Diff Panel',
    icon: GitCompareArrows,
    keywords: ['diff', 'compare', 'changes'],
    shortcut: HOTKEYS.toggleDiff.display,
    onSelect: (close) => {
      useUIStore.getState().toggleDiff();
      close();
    },
  },
  {
    id: 'action:toggle-sidebar',
    label: 'Toggle Sidebar',
    icon: PanelLeftClose,
    keywords: ['sidebar', 'panel', 'navigation'],
    shortcut: HOTKEYS.toggleSidebar.display,
    onSelect: (close) => {
      useUIStore.getState().toggleSidebar();
      close();
    },
  },
  {
    id: 'action:settings',
    label: 'Settings',
    icon: Settings,
    keywords: ['settings', 'preferences', 'config'],
    shortcut: HOTKEYS.settings.display,
    onSelect: (close) => {
      useUIStore.getState().setSettingsOpen(true);
      close();
    },
  },
  {
    id: 'action:keyboard-shortcuts',
    label: 'Keyboard Shortcuts',
    icon: Keyboard,
    keywords: ['keyboard', 'shortcuts', 'hotkeys', 'help'],
    shortcut: HOTKEYS.showShortcutsAlt.display,
    onSelect: (close) => {
      useUIStore.getState().setShortcutsModalOpen(true);
      close();
    },
  },
];

export function createActionsProvider(close: () => void): CommandProvider {
  return (context: CommandContext): CommandItem[] => {
    return ACTIONS.map((action) => {
      const score = context.query ? fuzzyScore(context.query, action.label) : 0;

      if (context.query && score < 0) {
        const keywordMatch = action.keywords.some((kw) => fuzzyScore(context.query, kw) >= 0);
        if (!keywordMatch) return null;
      }

      const item: CommandItem = {
        id: action.id,
        kind: 'action',
        label: action.label,
        icon: action.icon,
        keywords: action.keywords,
        score: Math.max(score, 0),
        shortcut: action.shortcut,
        group: 'Actions',
        onSelect: () => action.onSelect(close),
      };

      return item;
    }).filter((item): item is CommandItem => item !== null);
  };
}
