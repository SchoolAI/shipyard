import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollabLifecycle } from './use-collab-lifecycle';

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

vi.mock('./use-collab-webrtc-sync', () => ({
  useCollabWebRTCSync: vi.fn(() => ({ peerStates: new Map() })),
}));

const COLLAB_SESSION_KEY = 'shipyard-collab-session';

function makeDefaultProps(overrides: Partial<Parameters<typeof useCollabLifecycle>[0]> = {}) {
  return {
    authToken: 'test-token',
    activeTaskId: null as string | null,
    setActiveTask: vi.fn(),
    collabAdapter: null,
    sharedTaskIds: new Set<string>(),
    hasPersonalConnection: false,
    ...overrides,
  };
}

describe('useCollabLifecycle', () => {
  let mockConn: MockConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConn = createMockConnection();
    latestMockConn = mockConn;
    sessionStorage.clear();

    Object.defineProperty(window, 'location', {
      value: { pathname: '/', search: '', origin: 'http://localhost:3000' },
      writable: true,
      configurable: true,
    });
  });

  it('returns idle state when no collab URL', () => {
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.taskId).toBeNull();
    expect(result.current.role).toBeNull();
    expect(result.current.isOwner).toBe(false);
    expect(result.current.isReadOnly).toBe(false);
    expect(result.current.isCollabMode).toBe(false);
  });

  it('join() sets up collab room connection', () => {
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    expect(result.current.connection).toBe(mockConn);
  });

  it('join() persists URL to sessionStorage', () => {
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    expect(sessionStorage.getItem(COLLAB_SESSION_KEY)).toBe('ws://test/collab/room1?token=abc');
  });

  it('leave() clears connection and sessionStorage', () => {
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      result.current.leave();
    });

    expect(result.current.connection).toBeNull();
    expect(sessionStorage.getItem(COLLAB_SESSION_KEY)).toBeNull();
  });

  it('activates task when authenticated message received', () => {
    const setActiveTask = vi.fn();
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps({ setActiveTask })));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      mockConn._emitStateChange('connected');
    });

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    expect(result.current.taskId).toBe('task-42');
    expect(setActiveTask).toHaveBeenCalledWith('task-42');
  });

  it('populates sharedTaskIds when authenticated', () => {
    const sharedTaskIds = new Set<string>();
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps({ sharedTaskIds })));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    expect(sharedTaskIds.has('task-42')).toBe(true);
  });

  it('derives role from participants list', () => {
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    act(() => {
      mockConn._emitMessage({
        type: 'participants-list',
        participants: [
          { userId: 'usr_owner', username: 'owner', role: 'owner' },
          { userId: 'usr_1', username: 'alice', role: 'collaborator-full' },
        ],
      });
    });

    expect(result.current.role).toBe('collaborator-full');
    expect(result.current.isOwner).toBe(false);
    expect(result.current.isReadOnly).toBe(false);
  });

  it('isReadOnly is true for viewer role', () => {
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    act(() => {
      mockConn._emitMessage({
        type: 'participants-list',
        participants: [
          { userId: 'usr_owner', username: 'owner', role: 'owner' },
          { userId: 'usr_1', username: 'alice', role: 'viewer' },
        ],
      });
    });

    expect(result.current.isReadOnly).toBe(true);
  });

  it('isCollabMode is true when connected and no personal connection', () => {
    const { result } = renderHook(() =>
      useCollabLifecycle(makeDefaultProps({ hasPersonalConnection: false }))
    );

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      mockConn._emitStateChange('connected');
    });

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    expect(result.current.isCollabMode).toBe(true);
  });

  it('isCollabMode is false when personal connection exists', () => {
    const { result } = renderHook(() =>
      useCollabLifecycle(makeDefaultProps({ hasPersonalConnection: true }))
    );

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      mockConn._emitStateChange('connected');
    });

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    expect(result.current.isCollabMode).toBe(false);
  });

  it('restores from sessionStorage on mount', () => {
    sessionStorage.setItem(COLLAB_SESSION_KEY, 'ws://test/collab/room1?token=abc');

    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    expect(result.current.connection).toBe(mockConn);
  });

  it('does not restore from sessionStorage after intentional leave', () => {
    const { result, rerender } = renderHook(() => useCollabLifecycle(makeDefaultProps()));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      result.current.leave();
    });

    rerender();

    expect(result.current.connection).toBeNull();
  });

  it('leaves collab when activeTaskId transitions to null', () => {
    const props = makeDefaultProps({ activeTaskId: 'task-42' });
    const { result, rerender } = renderHook((p: typeof props) => useCollabLifecycle(p), {
      initialProps: props,
    });

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    rerender({ ...props, activeTaskId: null });

    expect(sessionStorage.getItem(COLLAB_SESSION_KEY)).toBeNull();
  });

  it('does not activate task after leave', () => {
    const setActiveTask = vi.fn();
    const { result } = renderHook(() => useCollabLifecycle(makeDefaultProps({ setActiveTask })));

    act(() => {
      result.current.join('ws://test/collab/room1?token=abc');
    });

    act(() => {
      result.current.leave();
    });

    setActiveTask.mockClear();

    act(() => {
      mockConn._emitMessage({
        type: 'authenticated',
        userId: 'usr_1',
        username: 'alice',
        taskId: 'task-42',
      });
    });

    expect(setActiveTask).not.toHaveBeenCalled();
  });
});
