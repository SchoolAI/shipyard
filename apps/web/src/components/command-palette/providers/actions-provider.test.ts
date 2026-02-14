import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../../../stores/task-store';
import { useUIStore } from '../../../stores/ui-store';
import type { CommandContext } from '../types';
import { createActionsProvider } from './actions-provider';

describe('createActionsProvider', () => {
  const close = vi.fn();
  let provider: ReturnType<typeof createActionsProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    provider = createActionsProvider(close);
  });

  it('returns all 6 actions when query is empty', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.kind).toBe('action');
      expect(item.group).toBe('Actions');
    }
  });

  it('filters actions by label match', () => {
    const context: CommandContext = { activeTaskId: null, query: 'terminal' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.label === 'Toggle Terminal')).toBe(true);
  });

  it('filters actions by keyword match', () => {
    const context: CommandContext = { activeTaskId: null, query: 'shell' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.label === 'Toggle Terminal')).toBe(true);
  });

  it('returns no items when query matches nothing', () => {
    const context: CommandContext = { activeTaskId: null, query: 'zzzznotfound' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('each action has a shortcut', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.shortcut).toBeDefined();
      expect(typeof item.shortcut).toBe('string');
    }
  });

  it('each action has an icon', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.icon).toBeDefined();
    }
  });

  it('New Task calls createAndActivateTask and close', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);
    const newTaskItem = items.find((i) => i.id === 'action:new-task');
    expect(newTaskItem).toBeDefined();

    const createAndActivateTask = vi.spyOn(useTaskStore.getState(), 'createAndActivateTask');
    newTaskItem!.onSelect();

    expect(createAndActivateTask).toHaveBeenCalledWith('New task');
    expect(close).toHaveBeenCalled();
  });

  it('Toggle Terminal calls toggleTerminal and close', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);
    const terminalItem = items.find((i) => i.id === 'action:toggle-terminal');
    expect(terminalItem).toBeDefined();

    const toggleTerminal = vi.spyOn(useUIStore.getState(), 'toggleTerminal');
    terminalItem!.onSelect();

    expect(toggleTerminal).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('Settings calls setSettingsOpen and close', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);
    const settingsItem = items.find((i) => i.id === 'action:settings');
    expect(settingsItem).toBeDefined();

    const setSettingsOpen = vi.spyOn(useUIStore.getState(), 'setSettingsOpen');
    settingsItem!.onSelect();

    expect(setSettingsOpen).toHaveBeenCalledWith(true);
    expect(close).toHaveBeenCalled();
  });

  it('Keyboard Shortcuts calls setShortcutsModalOpen and close', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);
    const shortcutsItem = items.find((i) => i.id === 'action:keyboard-shortcuts');
    expect(shortcutsItem).toBeDefined();

    const setShortcutsModalOpen = vi.spyOn(useUIStore.getState(), 'setShortcutsModalOpen');
    shortcutsItem!.onSelect();

    expect(setShortcutsModalOpen).toHaveBeenCalledWith(true);
    expect(close).toHaveBeenCalled();
  });
});
