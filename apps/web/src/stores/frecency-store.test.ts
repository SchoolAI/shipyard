import { beforeEach, describe, expect, it } from 'vitest';
import { useFrecencyStore } from './frecency-store';

describe('useFrecencyStore', () => {
  beforeEach(() => {
    useFrecencyStore.setState(useFrecencyStore.getInitialState(), true);
  });

  it('starts with empty entries', () => {
    expect(Object.keys(useFrecencyStore.getState().entries)).toHaveLength(0);
  });

  it('record creates an entry', () => {
    useFrecencyStore.getState().record('task-1');
    const entry = useFrecencyStore.getState().entries['task-1'];
    expect(entry).toBeDefined();
    expect(entry?.timestamps).toHaveLength(1);
  });

  it('getScore returns 0 for unknown id', () => {
    expect(useFrecencyStore.getState().getScore('nonexistent')).toBe(0);
  });

  it('getScore returns positive for recorded id', () => {
    useFrecencyStore.getState().record('task-1');
    expect(useFrecencyStore.getState().getScore('task-1')).toBeGreaterThan(0);
  });

  it('prune removes stale entries but keeps recent ones', () => {
    useFrecencyStore.getState().record('recent');

    const HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;
    const ancient = Date.now() - HALF_LIFE_MS * 30;
    useFrecencyStore.setState({
      entries: {
        ...useFrecencyStore.getState().entries,
        stale: { id: 'stale', timestamps: [ancient] },
      },
    });

    useFrecencyStore.getState().prune();

    expect(useFrecencyStore.getState().entries.recent).toBeDefined();
    expect(useFrecencyStore.getState().entries.stale).toBeUndefined();
  });
});
