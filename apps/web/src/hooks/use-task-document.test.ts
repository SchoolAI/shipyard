import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockRepo = {
  get: vi.fn(),
};

const mockEphemeralStore = {
  getAll: vi.fn(() => new Map()),
  subscribe: vi.fn(() => () => {}),
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

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
      config: {
        model: null,
        cwd: null,
        reasoningEffort: null,
        permissionMode: null,
      },
      conversation: [],
      sessions: [],
      diffState: null,
      diffComments: {},
    })),
  },
  loroDoc: {
    opCount: vi.fn(() => 0),
    frontiers: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  },
  permReqs: { ...mockEphemeralStore },
  permResps: { ...mockEphemeralStore },
};

mockRepo.get.mockReturnValue(mockHandle);

vi.mock('../providers/repo-provider', () => ({
  useRepo: vi.fn(() => mockRepo),
}));

vi.mock('@loro-extended/change', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@loro-extended/change')>();
  return { ...actual, change: vi.fn() };
});

vi.mock('@loro-extended/react', () => ({
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
  });

  it('reports isLoading as false when meta is present', () => {
    const { result } = renderHook(() => useTaskDocument('task-1'));

    expect(result.current.isLoading).toBe(false);
  });
});
