import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageStore } from '../../../stores/message-store';
import { useTaskStore } from '../../../stores/task-store';
import type { CommandContext } from '../types';
import { createMessageSearchProvider } from './message-search-provider';

describe('createMessageSearchProvider', () => {
  const close = vi.fn();
  let provider: ReturnType<typeof createMessageSearchProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    useMessageStore.setState(useMessageStore.getInitialState(), true);
    provider = createMessageSearchProvider(close);
  });

  it('returns nothing when query is empty', () => {
    const context: CommandContext = { activeTaskId: null, query: '' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('returns nothing when query is too short (< 2 chars)', () => {
    const context: CommandContext = { activeTaskId: null, query: 'a' };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('finds messages matching the query', () => {
    const context: CommandContext = { activeTaskId: null, query: 'JWT' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.kind).toBe('message');
      expect(item.group).toBe('Messages');
    }
  });

  it('returns no items when query matches nothing', () => {
    const context: CommandContext = {
      activeTaskId: null,
      query: 'zzzznotfoundxyz',
    };
    const items = provider(context);

    expect(items).toHaveLength(0);
  });

  it('includes task title as subtitle', () => {
    const context: CommandContext = { activeTaskId: null, query: 'refresh token' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    const firstItem = items[0];
    expect(firstItem?.subtitle).toBeDefined();
    expect(typeof firstItem?.subtitle).toBe('string');
  });

  it('limits results to 10', () => {
    const manyMessages = Array.from({ length: 20 }, (_, i) => ({
      id: `msg-bulk-${i}`,
      taskId: 'task-1',
      role: 'user' as const,
      content: `Searching for authentication pattern number ${i}`,
      createdAt: Date.now() - i * 1000,
    }));

    useMessageStore.setState({
      messagesByTask: { 'task-1': manyMessages },
    });

    const context: CommandContext = { activeTaskId: null, query: 'authentication' };
    const items = provider(context);

    expect(items.length).toBeLessThanOrEqual(10);
  });

  it('calls setActiveTask and close on select', () => {
    useTaskStore.getState().setActiveTask(null);
    expect(useTaskStore.getState().activeTaskId).toBeNull();

    const context: CommandContext = { activeTaskId: null, query: 'JWT' };
    const items = provider(context);
    const firstItem = items[0];
    expect(firstItem).toBeDefined();

    firstItem!.onSelect();

    expect(useTaskStore.getState().activeTaskId).not.toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('searches across multiple tasks', () => {
    const context: CommandContext = { activeTaskId: null, query: 'migration' };
    const items = provider(context);

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.subtitle?.includes('Review PR'))).toBe(true);
  });

  it('sorts results by score (highest first)', () => {
    const context: CommandContext = { activeTaskId: null, query: 'token' };
    const items = provider(context);

    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.score).toBeGreaterThanOrEqual(items[i]!.score);
    }
  });
});
