import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockHandle = {
  doc: {
    toJSON: vi.fn(() => ({ taskIndex: {} })),
  },
  loroDoc: {
    opCount: vi.fn(() => 0),
    frontiers: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  },
  capabilities: {
    subscribe: vi.fn(() => () => {}),
    getAll: vi.fn(() => new Map()),
  },
  enhancePromptReqs: { set: vi.fn(), delete: vi.fn() },
  enhancePromptResps: { subscribe: vi.fn(() => () => {}), delete: vi.fn() },
  worktreeCreateReqs: { set: vi.fn(), delete: vi.fn() },
  worktreeCreateResps: { subscribe: vi.fn(() => () => {}), delete: vi.fn() },
};

// eslint-disable-next-line no-restricted-syntax -- test: need untyped mock to match repo.get() signature
const mockRepoGet = vi.fn((..._args: unknown[]) => mockHandle);

const mockRepo = {
  get: mockRepoGet,
};

vi.mock('../providers/repo-provider', () => ({
  useRepo: vi.fn(() => mockRepo),
}));

import { DEFAULT_EPOCH, ROOM_EPHEMERAL_DECLARATIONS } from '@shipyard/loro-schema';
import { useRoomHandle } from './use-room-handle';

describe('useRoomHandle', () => {
  it('returns a room handle object', () => {
    const { result } = renderHook(() => useRoomHandle('user-1'));

    expect(result.current).toBeDefined();
    expect(mockRepoGet).toHaveBeenCalled();
  });

  it('uses the correct document ID pattern', () => {
    renderHook(() => useRoomHandle('user-1'));

    const lastCall = mockRepoGet.mock.calls[mockRepoGet.mock.calls.length - 1]!;
    expect(lastCall[0]).toBe(`room:user-1:${DEFAULT_EPOCH}`);
  });

  it('passes ROOM_EPHEMERAL_DECLARATIONS as third argument', () => {
    renderHook(() => useRoomHandle('user-1'));

    const lastCall = mockRepoGet.mock.calls[mockRepoGet.mock.calls.length - 1]!;
    expect(lastCall[2]).toBe(ROOM_EPHEMERAL_DECLARATIONS);
  });

  it('uses sentinel ID when userId is null', () => {
    renderHook(() => useRoomHandle(null));

    const lastCall = mockRepoGet.mock.calls[mockRepoGet.mock.calls.length - 1]!;
    expect(lastCall[0]).toBe(`room:__sentinel__:${DEFAULT_EPOCH}`);
  });

  it('returns reference-stable handle across re-renders', () => {
    const { result, rerender } = renderHook(() => useRoomHandle('user-1'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
