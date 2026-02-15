import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrecencyStore } from '../../../stores/frecency-store';
import type { CommandContext, CommandItem, CommandProvider } from '../types';
import { createRecentProvider } from './recent-provider';

function createMockProvider(items: CommandItem[]): CommandProvider {
  return () => items;
}

function createMockItem(overrides: Partial<CommandItem> = {}): CommandItem {
  return {
    id: `item:${Math.random().toString(36).slice(2)}`,
    kind: 'action',
    label: 'Mock Item',
    keywords: [],
    score: 0,
    group: 'Test',
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe('createRecentProvider', () => {
  const close = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useFrecencyStore.setState(useFrecencyStore.getInitialState(), true);
  });

  it('returns nothing when query is present', () => {
    const items = [createMockItem({ id: 'a' })];
    const provider = createRecentProvider([createMockProvider(items)], close);

    const context: CommandContext = { activeTaskId: null, query: 'test' };
    const result = provider(context);

    expect(result).toHaveLength(0);
  });

  it('returns nothing when no items have frecency scores', () => {
    const items = [createMockItem({ id: 'a' }), createMockItem({ id: 'b' })];
    const provider = createRecentProvider([createMockProvider(items)], close);

    const context: CommandContext = { activeTaskId: null, query: '' };
    const result = provider(context);

    expect(result).toHaveLength(0);
  });

  it('returns items ranked by frecency score', () => {
    const itemA = createMockItem({ id: 'item-a', label: 'Item A' });
    const itemB = createMockItem({ id: 'item-b', label: 'Item B' });
    const itemC = createMockItem({ id: 'item-c', label: 'Item C' });

    useFrecencyStore.getState().record('item-b');
    useFrecencyStore.getState().record('item-b');
    useFrecencyStore.getState().record('item-a');

    const provider = createRecentProvider([createMockProvider([itemA, itemB, itemC])], close);

    const context: CommandContext = { activeTaskId: null, query: '' };
    const result = provider(context);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('recent:item-b');
    expect(result[1]?.id).toBe('recent:item-a');
  });

  it('limits to 5 items max', () => {
    const items: CommandItem[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `item-${i}`;
      items.push(createMockItem({ id, label: `Item ${i}` }));
      useFrecencyStore.getState().record(id);
    }

    const provider = createRecentProvider([createMockProvider(items)], close);

    const context: CommandContext = { activeTaskId: null, query: '' };
    const result = provider(context);

    expect(result).toHaveLength(5);
  });

  it('sets kind to "recent" and group to "Recent"', () => {
    const item = createMockItem({ id: 'item-x', kind: 'action', group: 'Actions' });
    useFrecencyStore.getState().record('item-x');

    const provider = createRecentProvider([createMockProvider([item])], close);

    const context: CommandContext = { activeTaskId: null, query: '' };
    const result = provider(context);

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('recent');
    expect(result[0]?.group).toBe('Recent');
  });

  it('aggregates items from multiple providers', () => {
    const itemA = createMockItem({ id: 'from-a', label: 'From A' });
    const itemB = createMockItem({ id: 'from-b', label: 'From B' });
    useFrecencyStore.getState().record('from-a');
    useFrecencyStore.getState().record('from-b');

    const provider = createRecentProvider(
      [createMockProvider([itemA]), createMockProvider([itemB])],
      close
    );

    const context: CommandContext = { activeTaskId: null, query: '' };
    const result = provider(context);

    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain('recent:from-a');
    expect(ids).toContain('recent:from-b');
  });

  it('passes activeTaskId through to sub-providers', () => {
    const mockProvider = vi.fn().mockReturnValue([]);
    const provider = createRecentProvider([mockProvider], close);

    const context: CommandContext = { activeTaskId: 'task-123', query: '' };
    provider(context);

    expect(mockProvider).toHaveBeenCalledWith({
      activeTaskId: 'task-123',
      query: '',
    });
  });
});
