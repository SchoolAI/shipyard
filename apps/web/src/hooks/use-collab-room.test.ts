import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollabRoom } from './use-collab-room';

type MessageHandler = (msg: Record<string, unknown>) => void;
type StateHandler = (state: string) => void;

interface MockConnection {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  _emitMessage: (msg: Record<string, unknown>) => void;
  _emitStateChange: (state: string) => void;
}

let latestMockConn: MockConnection;

function createMockConnection(): MockConnection {
  let messageHandler: MessageHandler | undefined;
  let stateHandler: StateHandler | undefined;
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn().mockReturnValue('disconnected'),
    onMessage: vi.fn((handler: MessageHandler) => {
      messageHandler = handler;
      return vi.fn();
    }),
    onStateChange: vi.fn((handler: StateHandler) => {
      stateHandler = handler;
      return vi.fn();
    }),
    send: vi.fn(),
    _emitMessage(msg: Record<string, unknown>) {
      messageHandler?.(msg);
    },
    _emitStateChange(state: string) {
      stateHandler?.(state);
    },
  };
}

vi.mock('@shipyard/session', () => ({
  CollabRoomConnection: vi.fn(function MockCollabRoomConnection() {
    return latestMockConn;
  }),
}));

describe('useCollabRoom', () => {
  let mockConn: MockConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConn = createMockConnection();
    latestMockConn = mockConn;
  });

  it('returns empty participants when url is null', () => {
    const { result } = renderHook(() => useCollabRoom(null));

    expect(result.current.participants).toEqual([]);
  });

  it('returns disconnected state when url is null', () => {
    const { result } = renderHook(() => useCollabRoom(null));

    expect(result.current.connectionState).toBe('disconnected');
  });

  it('returns null connection when url is null', () => {
    const { result } = renderHook(() => useCollabRoom(null));

    expect(result.current.connection).toBeNull();
  });

  it('returns null taskId and currentUserId when url is null', () => {
    const { result } = renderHook(() => useCollabRoom(null));

    expect(result.current.taskId).toBeNull();
    expect(result.current.currentUserId).toBeNull();
  });

  it('exposes the connection instance when url is provided', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    expect(result.current.connection).toBe(mockConn);
  });

  it('sets taskId and currentUserId on authenticated message', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'user1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    expect(result.current.taskId).toBe('task-42');
    expect(result.current.currentUserId).toBe('user1');
  });

  it('returns participants from participants-list message', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'participants-list',
        participants: [
          { userId: 'user1', username: 'alice', role: 'owner' },
          { userId: 'user2', username: 'bob', role: 'collaborator-full' },
        ],
      });
    });

    expect(result.current.participants).toEqual([
      { userId: 'user1', username: 'alice', role: 'owner' },
      { userId: 'user2', username: 'bob', role: 'collaborator-full' },
    ]);
  });

  it('adds participant on participant-joined message', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'participants-list',
        participants: [{ userId: 'user1', username: 'alice', role: 'owner' }],
      });
    });

    act(() => {
      mockConn._emitMessage({
        type: 'participant-joined',
        participant: { userId: 'user2', username: 'bob', role: 'collaborator-full' },
      });
    });

    expect(result.current.participants).toHaveLength(2);
  });

  it('does not duplicate participant on participant-joined with existing userId', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'participants-list',
        participants: [{ userId: 'user1', username: 'alice', role: 'owner' }],
      });
    });

    act(() => {
      mockConn._emitMessage({
        type: 'participant-joined',
        participant: { userId: 'user1', username: 'alice', role: 'owner' },
      });
    });

    expect(result.current.participants).toHaveLength(1);
  });

  it('removes participant on participant-left message', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'participants-list',
        participants: [
          { userId: 'user1', username: 'alice', role: 'owner' },
          { userId: 'user2', username: 'bob', role: 'collaborator-full' },
        ],
      });
    });

    act(() => {
      mockConn._emitMessage({ type: 'participant-left', userId: 'user1' });
    });

    expect(result.current.participants).toEqual([
      { userId: 'user2', username: 'bob', role: 'collaborator-full' },
    ]);
  });

  it('reports connection state', () => {
    const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitStateChange('connected');
    });

    expect(result.current.connectionState).toBe('connected');
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

    unmount();

    expect(mockConn.disconnect).toHaveBeenCalled();
  });

  describe('reconnection on visibility/online events', () => {
    it('reconnects when page becomes visible while disconnected', () => {
      const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

      act(() => {
        mockConn._emitStateChange('connected');
      });
      act(() => {
        mockConn._emitStateChange('disconnected');
      });

      expect(result.current.connectionState).toBe('disconnected');

      mockConn.connect.mockClear();

      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockConn.connect).toHaveBeenCalled();
    });

    it('reconnects when browser goes online while disconnected', () => {
      const { result } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

      act(() => {
        mockConn._emitStateChange('connected');
      });
      act(() => {
        mockConn._emitStateChange('disconnected');
      });

      expect(result.current.connectionState).toBe('disconnected');
      mockConn.connect.mockClear();

      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(mockConn.connect).toHaveBeenCalled();
    });

    it('does not reconnect on visibility change when already connected', () => {
      renderHook(() => useCollabRoom({ url: 'ws://test' }));

      act(() => {
        mockConn._emitStateChange('connected');
      });

      const callCountBeforeVisibility = mockConn.connect.mock.calls.length;

      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockConn.connect).toHaveBeenCalledTimes(callCountBeforeVisibility);
    });

    it('cleans up visibility and online event listeners on unmount', () => {
      const docAddSpy = vi.spyOn(document, 'addEventListener');
      const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
      const winAddSpy = vi.spyOn(window, 'addEventListener');
      const winRemoveSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useCollabRoom({ url: 'ws://test' }));

      unmount();

      const docVisibilityAdds = docAddSpy.mock.calls.filter(
        ([event]) => event === 'visibilitychange'
      );
      const docVisibilityRemoves = docRemoveSpy.mock.calls.filter(
        ([event]) => event === 'visibilitychange'
      );
      expect(docVisibilityAdds.length).toBeGreaterThan(0);
      expect(docVisibilityRemoves.length).toBe(docVisibilityAdds.length);

      const winOnlineAdds = winAddSpy.mock.calls.filter(([event]) => event === 'online');
      const winOnlineRemoves = winRemoveSpy.mock.calls.filter(([event]) => event === 'online');
      expect(winOnlineAdds.length).toBeGreaterThan(0);
      expect(winOnlineRemoves.length).toBe(winOnlineAdds.length);

      docAddSpy.mockRestore();
      docRemoveSpy.mockRestore();
      winAddSpy.mockRestore();
      winRemoveSpy.mockRestore();
    });
  });
});
