import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRepo = {
  get: vi.fn(),
};

const mockHandle = {
  doc: {
    toJSON: vi.fn(() => ({
      taskIndex: {
        'task-1': {
          taskId: 'task-1',
          title: 'Test task',
          status: 'submitted',
          createdAt: 1000,
          updatedAt: 2000,
        },
      },
    })),
  },
  loroDoc: {
    opCount: vi.fn(() => 0),
    frontiers: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  },
};

mockRepo.get.mockReturnValue(mockHandle);

vi.mock('../providers/repo-provider', () => ({
  useRepo: vi.fn(() => mockRepo),
}));

const mockUseDoc = vi.fn((_handle: unknown, selector: (doc: unknown) => unknown) => {
  const json = mockHandle.doc.toJSON();
  return selector(json);
});

vi.mock('@loro-extended/react', () => ({
  useDoc: (handle: unknown, selector: (doc: unknown) => unknown) => mockUseDoc(handle, selector),
}));

import { useTaskIndex } from './use-task-index';

describe('useTaskIndex', () => {
  beforeEach(() => {
    mockUseDoc.mockImplementation((_handle: unknown, selector: (doc: unknown) => unknown) => {
      const json = mockHandle.doc.toJSON();
      return selector(json);
    });
  });

  it('returns empty index when userId is null', () => {
    const { result } = renderHook(() => useTaskIndex(null));

    expect(result.current.taskIndex).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.doc).toBeNull();
  });

  it('returns task index data when userId is provided', () => {
    const { result } = renderHook(() => useTaskIndex('user-1'));

    expect(result.current.taskIndex).toEqual({
      'task-1': {
        taskId: 'task-1',
        title: 'Test task',
        status: 'submitted',
        createdAt: 1000,
        updatedAt: 2000,
      },
    });
    expect(result.current.doc).not.toBeNull();
  });

  it('reports isLoading as false when taskIndex is present', () => {
    const { result } = renderHook(() => useTaskIndex('user-1'));

    expect(result.current.isLoading).toBe(false);
  });

  it('reports isLoading as true when useDoc returns undefined', () => {
    mockUseDoc.mockReturnValue(undefined);

    const { result } = renderHook(() => useTaskIndex('user-1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.taskIndex).toEqual({});
  });
});
