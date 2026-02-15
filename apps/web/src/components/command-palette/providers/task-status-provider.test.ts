import type { A2ATaskState, TaskIndexEntry } from '@shipyard/loro-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from '../types';
import { createTaskStatusProvider, getValidTransitions } from './task-status-provider';

const MOCK_TASK_INDEX: Record<string, TaskIndexEntry> = {
  'task-working': {
    taskId: 'task-working',
    title: 'Scaffold authentication microservice',
    status: 'working',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 60000,
  },
  'task-submitted': {
    taskId: 'task-submitted',
    title: 'Review PR #42 - database migration',
    status: 'submitted',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 1800000,
  },
  'task-completed': {
    taskId: 'task-completed',
    title: 'Completed task',
    status: 'completed',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  },
  'task-failed': {
    taskId: 'task-failed',
    title: 'Failed task',
    status: 'failed',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  },
  'task-canceled': {
    taskId: 'task-canceled',
    title: 'Canceled task',
    status: 'canceled',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  },
  'task-input': {
    taskId: 'task-input',
    title: 'Input required task',
    status: 'input-required',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now(),
  },
};

describe('getValidTransitions', () => {
  it('allows canceling a submitted task', () => {
    expect(getValidTransitions('submitted')).toEqual(['canceled']);
  });

  it('allows canceling a working task', () => {
    expect(getValidTransitions('working')).toEqual(['canceled']);
  });

  it('allows canceling an input-required task', () => {
    expect(getValidTransitions('input-required')).toEqual(['canceled']);
  });

  it('allows no transitions from completed', () => {
    expect(getValidTransitions('completed')).toEqual([]);
  });

  it('allows no transitions from canceled', () => {
    expect(getValidTransitions('canceled')).toEqual([]);
  });

  it('allows retry (submitted) from failed', () => {
    expect(getValidTransitions('failed')).toEqual(['submitted']);
  });
});

describe('createTaskStatusProvider', () => {
  const close = vi.fn();
  const getTaskIndex = () => MOCK_TASK_INDEX;
  const onUpdateStatus = vi.fn();
  let provider: ReturnType<typeof createTaskStatusProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createTaskStatusProvider(close, getTaskIndex, onUpdateStatus);
  });

  it('returns nothing when there is no active task', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('only shows valid transitions for a working task', () => {
    const context: CommandContext = { activeTaskId: 'task-working', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('status:canceled');
    expect(items.every((i) => i.kind === 'task-status')).toBe(true);
    expect(items.every((i) => i.group === 'Change Status')).toBe(true);
  });

  it('only shows valid transitions for a submitted task', () => {
    const context: CommandContext = { activeTaskId: 'task-submitted', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('status:canceled');
  });

  it('shows no options for a completed task (terminal state)', () => {
    const context: CommandContext = { activeTaskId: 'task-completed', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('shows no options for a canceled task (terminal state)', () => {
    const context: CommandContext = { activeTaskId: 'task-canceled', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('allows retry from failed state', () => {
    const context: CommandContext = { activeTaskId: 'task-failed', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('status:submitted');
  });

  it('only shows cancel for input-required task', () => {
    const context: CommandContext = { activeTaskId: 'task-input', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('status:canceled');
  });

  it('returns nothing for a non-existent task id', () => {
    const context: CommandContext = { activeTaskId: 'nonexistent', query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('filters by query within valid transitions', () => {
    const context: CommandContext = { activeTaskId: 'task-working', query: 'cancel' };
    const items = provider(context);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('status:canceled');
  });

  it('filters out non-matching statuses', () => {
    const context: CommandContext = { activeTaskId: 'task-working', query: 'zzzznotfound' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('calls onUpdateStatus and close on select', () => {
    const context: CommandContext = { activeTaskId: 'task-working', query: '' };
    const items = provider(context);
    const cancelItem = items.find((i) => i.id === 'status:canceled');
    expect(cancelItem).toBeDefined();

    cancelItem!.onSelect();

    expect(onUpdateStatus).toHaveBeenCalledWith('task-working', 'canceled');
    expect(close).toHaveBeenCalled();
  });

  it('includes statusColor and subtitle', () => {
    const context: CommandContext = { activeTaskId: 'task-working', query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.statusColor).toBeDefined();
      expect(item.subtitle).toBeDefined();
      expect(item.subtitle).toContain('Scaffold authentication');
    }
  });

  it('each item has an icon', () => {
    const context: CommandContext = { activeTaskId: 'task-working', query: '' };
    const items = provider(context);

    for (const item of items) {
      expect(item.icon).toBeDefined();
    }
  });

  it('retry from failed calls onUpdateStatus with submitted', () => {
    const context: CommandContext = { activeTaskId: 'task-failed', query: '' };
    const items = provider(context);
    const retryItem = items[0];
    expect(retryItem).toBeDefined();

    retryItem!.onSelect();

    expect(onUpdateStatus).toHaveBeenCalledWith('task-failed', 'submitted' satisfies A2ATaskState);
    expect(close).toHaveBeenCalled();
  });
});
