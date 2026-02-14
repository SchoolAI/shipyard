import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../../../stores/task-store';
import type { CommandContext } from '../types';
import { createTaskStatusProvider } from './task-status-provider';

describe('createTaskStatusProvider', () => {
  const close = vi.fn();
  let provider: ReturnType<typeof createTaskStatusProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    provider = createTaskStatusProvider(close);
  });

  it('returns nothing when there is no active task', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('returns status options excluding the current status', () => {
    const context: CommandContext = { activeTaskId: 'task-1', query: '' };
    const items = provider(context);
    const activeTask = useTaskStore.getState().tasks.find((t) => t.id === 'task-1');

    expect(activeTask?.status).toBe('active');
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.kind === 'task-status')).toBe(true);
    expect(items.every((i) => i.group === 'Change Status')).toBe(true);
    expect(items.some((i) => i.id === 'status:active')).toBe(false);
  });

  it('returns nothing for a non-existent task id', () => {
    const context: CommandContext = { activeTaskId: 'nonexistent', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('filters by query', () => {
    const context: CommandContext = { activeTaskId: 'task-1', query: 'comp' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.id === 'status:completed')).toBe(true);
  });

  it('filters out non-matching statuses', () => {
    const context: CommandContext = { activeTaskId: 'task-1', query: 'zzzznotfound' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('calls updateTask and close on select', () => {
    const taskBefore = useTaskStore.getState().tasks.find((t) => t.id === 'task-1');
    expect(taskBefore?.status).toBe('active');

    const context: CommandContext = { activeTaskId: 'task-1', query: '' };
    const items = provider(context);
    const completedItem = items.find((i) => i.id === 'status:completed');
    expect(completedItem).toBeDefined();

    completedItem!.onSelect();

    const taskAfter = useTaskStore.getState().tasks.find((t) => t.id === 'task-1');
    expect(taskAfter?.status).toBe('completed');
    expect(close).toHaveBeenCalled();
  });

  it('includes statusColor and subtitle', () => {
    const context: CommandContext = { activeTaskId: 'task-1', query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.statusColor).toBeDefined();
      expect(item.subtitle).toBeDefined();
      expect(item.subtitle).toContain('Scaffold authentication');
    }
  });

  it('each item has an icon', () => {
    const context: CommandContext = { activeTaskId: 'task-1', query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.icon).toBeDefined();
    }
  });
});
