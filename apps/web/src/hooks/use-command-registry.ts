import { useCallback, useEffect, useMemo } from 'react';
import { createActionsProvider } from '../components/command-palette/providers/actions-provider';
import { createMessageSearchProvider } from '../components/command-palette/providers/message-search-provider';
import { createRecentProvider } from '../components/command-palette/providers/recent-provider';
import { createTaskStatusProvider } from '../components/command-palette/providers/task-status-provider';
import { createTasksProvider } from '../components/command-palette/providers/tasks-provider';
import type { CommandContext, CommandItem } from '../components/command-palette/types';
import { useTaskStore, useUIStore } from '../stores';
import { useFrecencyStore } from '../stores/frecency-store';

interface GroupedItems {
  group: string;
  items: CommandItem[];
}

function groupAndSort(items: CommandItem[]): GroupedItems[] {
  const groupMap = new Map<string, CommandItem[]>();

  for (const item of items) {
    const existing = groupMap.get(item.group);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(item.group, [item]);
    }
  }

  const groups: GroupedItems[] = [];
  for (const [group, groupItems] of groupMap) {
    groupItems.sort((a, b) => b.score - a.score);
    groups.push({ group, items: groupItems });
  }

  return groups;
}

function deduplicateRecentItems(items: CommandItem[]): CommandItem[] {
  const recentBaseIds = new Set<string>();

  for (const item of items) {
    if (item.kind === 'recent') {
      recentBaseIds.add(item.id.replace(/^recent:/, ''));
    }
  }

  return items.filter((item) => {
    if (item.kind === 'recent') return true;
    return !recentBaseIds.has(item.id);
  });
}

export interface CommandRegistry {
  getItems: (query: string) => GroupedItems[];
  recordSelection: (id: string) => void;
}

export function useCommandRegistry(isOpen = false): CommandRegistry {
  useEffect(() => {
    if (isOpen) {
      useFrecencyStore.getState().prune();
    }
  }, [isOpen]);
  const close = useCallback(() => {
    useUIStore.getState().setCommandPaletteOpen(false);
  }, []);

  const tasksProvider = useMemo(() => createTasksProvider(close), [close]);

  const actionsProvider = useMemo(() => createActionsProvider(close), [close]);

  const taskStatusProvider = useMemo(() => createTaskStatusProvider(close), [close]);

  const messageSearchProvider = useMemo(() => createMessageSearchProvider(close), [close]);

  const coreProviders = useMemo(
    () => [tasksProvider, actionsProvider, taskStatusProvider, messageSearchProvider],
    [tasksProvider, actionsProvider, taskStatusProvider, messageSearchProvider]
  );

  const recentProvider = useMemo(
    () => createRecentProvider(coreProviders, close),
    [coreProviders, close]
  );

  const getItems = useCallback(
    (query: string): GroupedItems[] => {
      const activeTaskId = useTaskStore.getState().activeTaskId;
      const context: CommandContext = { activeTaskId, query };

      const allItems: CommandItem[] = [];

      if (query.trim() === '') {
        allItems.push(...recentProvider(context));
      }

      for (const provider of coreProviders) {
        allItems.push(...provider(context));
      }

      const deduplicated = deduplicateRecentItems(allItems);
      return groupAndSort(deduplicated);
    },
    [coreProviders, recentProvider]
  );

  const recordSelection = useCallback((id: string) => {
    const baseId = id.replace(/^recent:/, '');
    useFrecencyStore.getState().record(baseId);
  }, []);

  return { getItems, recordSelection };
}
