import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockSubscribe = vi.fn(() => () => {});
const mockGetAll = vi.fn(() => new Map());

const mockHandle = {
  capabilities: {
    subscribe: mockSubscribe,
    getAll: mockGetAll,
  },
  doc: {
    toJSON: vi.fn(() => ({ taskIndex: {} })),
  },
  loroDoc: {
    opCount: vi.fn(() => 0),
    frontiers: vi.fn(() => []),
    subscribe: vi.fn(() => () => {}),
  },
};

const mockRepo = {
  get: vi.fn(() => mockHandle),
};

vi.mock('../providers/repo-provider', () => ({
  useRepo: vi.fn(() => mockRepo),
}));

import { useRoomCapabilities } from './use-room-capabilities';

describe('useRoomCapabilities', () => {
  it('returns empty map when userId is null', () => {
    const { result } = renderHook(() => useRoomCapabilities(null));

    expect(result.current.size).toBe(0);
  });

  it('subscribes to ephemeral capabilities when userId is provided', () => {
    renderHook(() => useRoomCapabilities('user-1'));

    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('returns initial capabilities from getAll()', () => {
    const caps = {
      models: [{ id: 'opus', label: 'Opus', provider: 'claude-code', reasoning: null }],
      environments: [],
      permissionModes: ['default'],
      homeDir: '/home/test',
    };
    mockGetAll.mockReturnValueOnce(new Map([['machine-1', caps]]));

    const { result } = renderHook(() => useRoomCapabilities('user-1'));

    expect(result.current.size).toBe(1);
    expect(result.current.get('machine-1')).toEqual(caps);
  });

  it('cleans up subscription on unmount', () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValueOnce(unsubscribe);

    const { unmount } = renderHook(() => useRoomCapabilities('user-1'));
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
