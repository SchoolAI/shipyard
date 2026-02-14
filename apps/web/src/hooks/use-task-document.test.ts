import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockHandle = {
  doc: {
    toJSON: vi.fn(() => ({
      meta: {
        id: 'task-1',
        title: 'Test task',
        status: 'submitted',
        createdAt: 1000,
        updatedAt: 2000,
      },
      conversation: [],
      sessions: [],
    })),
  },
  loroDoc: {
    opCount: vi.fn(() => 0),
    frontiers: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  },
};

vi.mock('@loro-extended/react', () => ({
  useHandle: vi.fn(() => mockHandle),
  useDoc: vi.fn((_handle: unknown, selector: (doc: unknown) => unknown) => {
    const json = mockHandle.doc.toJSON();
    return selector(json);
  }),
}));

import { useTaskDocument } from './use-task-document';

describe('useTaskDocument', () => {
  it('returns null meta and empty arrays when taskId is null', () => {
    const { result } = renderHook(() => useTaskDocument(null));

    expect(result.current.meta).toBeNull();
    expect(result.current.conversation).toEqual([]);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.handle).toBeNull();
  });

  it('returns document data when taskId is provided', () => {
    const { result } = renderHook(() => useTaskDocument('task-1'));

    expect(result.current.meta).toEqual({
      id: 'task-1',
      title: 'Test task',
      status: 'submitted',
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(result.current.conversation).toEqual([]);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.handle).toBe(mockHandle);
  });

  it('reports isLoading as false when meta is present', () => {
    const { result } = renderHook(() => useTaskDocument('task-1'));

    expect(result.current.isLoading).toBe(false);
  });
});
