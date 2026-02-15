import type { TaskIndexEntry } from '@shipyard/loro-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../../../stores/task-store';
import type { CommandContext } from '../types';
import { createTasksProvider } from './tasks-provider';

const MOCK_TASK_INDEX: Record<string, TaskIndexEntry> = {
  'task-1': {
    taskId: 'task-1',
    title: 'Scaffold authentication microservice',
    status: 'working',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 60000,
  },
  'task-2': {
    taskId: 'task-2',
    title: 'Review PR #42 - database migration',
    status: 'submitted',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 1800000,
  },
  'task-3': {
    taskId: 'task-3',
    title: 'Set up CI pipeline for monorepo',
    status: 'completed',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 43200000,
  },
};

describe('createTasksProvider', () => {
  const close = vi.fn();
  const getTaskIndex = () => MOCK_TASK_INDEX;
  let provider: ReturnType<typeof createTasksProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    provider = createTasksProvider(close, getTaskIndex);
  });

  it('returns all tasks when query is empty', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    expect(items).toHaveLength(Object.keys(MOCK_TASK_INDEX).length);
    for (const item of items) {
      expect(item.kind).toBe('task');
      expect(item.group).toBe('Tasks');
    }
  });

  it('filters tasks by fuzzy query', () => {
    const context: CommandContext = { activeTaskId: null, query: 'auth' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.label.toLowerCase().includes('auth'))).toBe(true);
  });

  it('returns no items when query matches nothing', () => {
    const context: CommandContext = { activeTaskId: null, query: 'zzzznotfound' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('calls setActiveTask and close on select', () => {
    useTaskStore.getState().setActiveTask(null);
    expect(useTaskStore.getState().activeTaskId).toBeNull();

    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);
    const firstItem = items[0];
    expect(firstItem).toBeDefined();

    firstItem!.onSelect();

    expect(useTaskStore.getState().activeTaskId).not.toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('includes statusColor from statusDotColor', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.statusColor).toBeDefined();
      expect(typeof item.statusColor).toBe('string');
    }
  });

  it('sorts results by score (highest first)', () => {
    const context: CommandContext = { activeTaskId: null, query: 'ci' };
    const items = provider(context);

    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.score).toBeGreaterThanOrEqual(items[i]!.score);
    }
  });
});
