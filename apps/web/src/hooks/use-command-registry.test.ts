import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/command-palette/providers/actions-provider', () => ({
  createActionsProvider: vi.fn(() => vi.fn(() => [])),
}));
vi.mock('../components/command-palette/providers/message-search-provider', () => ({
  createMessageSearchProvider: vi.fn(() => vi.fn(() => [])),
}));
vi.mock('../components/command-palette/providers/recent-provider', () => ({
  createRecentProvider: vi.fn(() => vi.fn(() => [])),
}));
vi.mock('../components/command-palette/providers/task-status-provider', () => ({
  createTaskStatusProvider: vi.fn(() => vi.fn(() => [])),
}));
vi.mock('../components/command-palette/providers/tasks-provider', () => ({
  createTasksProvider: vi.fn(() => vi.fn(() => [])),
}));
vi.mock('../stores/frecency-store', () => ({
  useFrecencyStore: Object.assign(() => ({}), {
    getState: () => ({ record: mockRecord }),
  }),
}));
vi.mock('../stores', () => ({
  useUIStore: Object.assign(() => false, {
    getState: () => ({ setCommandPaletteOpen: vi.fn() }),
  }),
  useTaskStore: Object.assign(() => null, {
    getState: () => ({ activeTaskId: 'task-1', setActiveTask: vi.fn() }),
  }),
}));
vi.mock('./use-task-index', () => ({
  useTaskIndex: vi.fn(() => ({ taskIndex: {}, isLoading: false, doc: null })),
}));

import { renderHook } from '@testing-library/react';
import { createActionsProvider } from '../components/command-palette/providers/actions-provider';
import { createMessageSearchProvider } from '../components/command-palette/providers/message-search-provider';
import { createRecentProvider } from '../components/command-palette/providers/recent-provider';
import { createTaskStatusProvider } from '../components/command-palette/providers/task-status-provider';
import { createTasksProvider } from '../components/command-palette/providers/tasks-provider';
import type { CommandItem, CommandProvider } from '../components/command-palette/types';
import { useCommandRegistry } from './use-command-registry';

const mockRecord = vi.fn();

const mockCreateTasksProvider = vi.mocked(createTasksProvider);
const mockCreateActionsProvider = vi.mocked(createActionsProvider);
const mockCreateTaskStatusProvider = vi.mocked(createTaskStatusProvider);
const mockCreateMessageSearchProvider = vi.mocked(createMessageSearchProvider);
const mockCreateRecentProvider = vi.mocked(createRecentProvider);

function makeItem(overrides: Partial<CommandItem> = {}): CommandItem {
  return {
    id: 'test-item',
    kind: 'action',
    label: 'Test',
    keywords: [],
    score: 1,
    onSelect: vi.fn(),
    group: 'Actions',
    ...overrides,
  };
}

describe('useCommandRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTasksProvider.mockReturnValue(vi.fn(() => []));
    mockCreateActionsProvider.mockReturnValue(vi.fn(() => []));
    mockCreateTaskStatusProvider.mockReturnValue(vi.fn(() => []));
    mockCreateMessageSearchProvider.mockReturnValue(vi.fn(() => []));
    mockCreateRecentProvider.mockReturnValue(vi.fn(() => []));
  });

  it('creates all providers on mount', () => {
    renderHook(() => useCommandRegistry());
    expect(mockCreateTasksProvider).toHaveBeenCalledOnce();
    expect(mockCreateActionsProvider).toHaveBeenCalledOnce();
    expect(mockCreateTaskStatusProvider).toHaveBeenCalledOnce();
    expect(mockCreateMessageSearchProvider).toHaveBeenCalledOnce();
    expect(mockCreateRecentProvider).toHaveBeenCalledOnce();
  });

  it('getItems returns empty groups when providers return nothing', () => {
    const { result } = renderHook(() => useCommandRegistry());
    const groups = result.current.getItems('test');
    expect(groups).toEqual([]);
  });

  it('getItems groups items by group field', () => {
    const tasksProviderFn: CommandProvider = vi.fn(() => [
      makeItem({ id: 'task-1', label: 'Task 1', group: 'Tasks', kind: 'task', score: 2 }),
    ]);
    const actionsProviderFn: CommandProvider = vi.fn(() => [
      makeItem({ id: 'action-1', label: 'Action 1', group: 'Actions', kind: 'action', score: 1 }),
    ]);
    mockCreateTasksProvider.mockReturnValue(tasksProviderFn);
    mockCreateActionsProvider.mockReturnValue(actionsProviderFn);

    const { result } = renderHook(() => useCommandRegistry());
    const groups = result.current.getItems('search');
    expect(groups).toHaveLength(2);

    const taskGroup = groups.find((g) => g.group === 'Tasks');
    const actionGroup = groups.find((g) => g.group === 'Actions');
    expect(taskGroup?.items).toHaveLength(1);
    expect(actionGroup?.items).toHaveLength(1);
  });

  it('getItems sorts items by score descending within each group', () => {
    const providerFn: CommandProvider = vi.fn(() => [
      makeItem({ id: 'a-1', label: 'Low score', group: 'Actions', score: 1 }),
      makeItem({ id: 'a-2', label: 'High score', group: 'Actions', score: 10 }),
      makeItem({ id: 'a-3', label: 'Mid score', group: 'Actions', score: 5 }),
    ]);
    mockCreateActionsProvider.mockReturnValue(providerFn);

    const { result } = renderHook(() => useCommandRegistry());
    const groups = result.current.getItems('search');
    const actionGroup = groups.find((g) => g.group === 'Actions');
    expect(actionGroup?.items[0]?.label).toBe('High score');
    expect(actionGroup?.items[1]?.label).toBe('Mid score');
    expect(actionGroup?.items[2]?.label).toBe('Low score');
  });

  it('getItems deduplicates core items that exist in recent group', () => {
    const tasksProviderFn: CommandProvider = vi.fn(() => [
      makeItem({ id: 'task-1', label: 'Task 1', group: 'Tasks', kind: 'task' }),
      makeItem({ id: 'task-2', label: 'Task 2', group: 'Tasks', kind: 'task' }),
    ]);
    const recentProviderFn: CommandProvider = vi.fn(() => [
      makeItem({ id: 'recent:task-1', label: 'Task 1', group: 'Recent', kind: 'recent' }),
      makeItem({
        id: 'recent:action-unique',
        label: 'Unique action',
        group: 'Recent',
        kind: 'recent',
      }),
    ]);
    mockCreateTasksProvider.mockReturnValue(tasksProviderFn);
    mockCreateRecentProvider.mockReturnValue(recentProviderFn);

    const { result } = renderHook(() => useCommandRegistry());
    const groups = result.current.getItems('');

    const recentGroup = groups.find((g) => g.group === 'Recent');
    expect(recentGroup?.items).toHaveLength(2);
    expect(recentGroup?.items.map((i) => i.id)).toContain('recent:task-1');
    expect(recentGroup?.items.map((i) => i.id)).toContain('recent:action-unique');

    const tasksGroup = groups.find((g) => g.group === 'Tasks');
    expect(tasksGroup?.items).toHaveLength(1);
    expect(tasksGroup?.items[0]?.id).toBe('task-2');
  });

  it('getItems only includes recent items for empty query', () => {
    const recentProviderFn = vi.fn<CommandProvider>(() => [
      makeItem({ id: 'recent:x', label: 'Recent X', group: 'Recent', kind: 'recent' }),
    ]);
    mockCreateRecentProvider.mockReturnValue(recentProviderFn);

    const { result } = renderHook(() => useCommandRegistry());

    result.current.getItems('');
    expect(recentProviderFn).toHaveBeenCalled();

    recentProviderFn.mockClear();

    result.current.getItems('search');
    expect(recentProviderFn).not.toHaveBeenCalled();
  });

  it('recordSelection strips recent: prefix and records to frecency store', () => {
    const { result } = renderHook(() => useCommandRegistry());
    result.current.recordSelection('recent:task-1');
    expect(mockRecord).toHaveBeenCalledWith('task-1');
  });

  it('recordSelection records raw id when no recent: prefix', () => {
    const { result } = renderHook(() => useCommandRegistry());
    result.current.recordSelection('task-1');
    expect(mockRecord).toHaveBeenCalledWith('task-1');
  });
});
