import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../../../stores/task-store';
import type { CommandContext } from '../types';
import { createTasksProvider } from './tasks-provider';

describe('createTasksProvider', () => {
  const close = vi.fn();
  let provider: ReturnType<typeof createTasksProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    provider = createTasksProvider(close);
  });

  it('returns all tasks when query is empty', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);
    const tasks = useTaskStore.getState().tasks;

    expect(items).toHaveLength(tasks.length);
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
