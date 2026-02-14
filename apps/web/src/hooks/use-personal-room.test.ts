import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersonalRoom } from './use-personal-room';

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
  PersonalRoomConnection: vi.fn(function MockPersonalRoomConnection() {
    return latestMockConn;
  }),
}));

describe('usePersonalRoom', () => {
  let mockConn: MockConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConn = createMockConnection();
    latestMockConn = mockConn;
  });

  it('returns empty agents when url is null', () => {
    const { result } = renderHook(() => usePersonalRoom(null));

    expect(result.current.agents).toEqual([]);
  });

  it('returns agents from agents-list message', () => {
    const { result } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'agents-list',
        agents: [
          {
            agentId: 'a1',
            machineId: 'm1',
            machineName: 'My Laptop',
            agentType: 'claude',
            status: 'idle',
          },
        ],
      });
    });

    expect(result.current.agents).toEqual([
      {
        agentId: 'a1',
        machineId: 'm1',
        machineName: 'My Laptop',
        agentType: 'claude',
        status: 'idle',
      },
    ]);
  });

  it('adds agent on agent-joined message', () => {
    const { result } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'agents-list',
        agents: [
          {
            agentId: 'a1',
            machineId: 'm1',
            machineName: 'Laptop',
            agentType: 'claude',
            status: 'idle',
          },
        ],
      });
    });

    act(() => {
      mockConn._emitMessage({
        type: 'agent-joined',
        agent: {
          agentId: 'a2',
          machineId: 'm2',
          machineName: 'Desktop',
          agentType: 'claude',
          status: 'running',
        },
      });
    });

    expect(result.current.agents).toHaveLength(2);
  });

  it('removes agent on agent-left message', () => {
    const { result } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'agents-list',
        agents: [
          {
            agentId: 'a1',
            machineId: 'm1',
            machineName: 'Laptop',
            agentType: 'claude',
            status: 'idle',
          },
          {
            agentId: 'a2',
            machineId: 'm2',
            machineName: 'Desktop',
            agentType: 'claude',
            status: 'idle',
          },
        ],
      });
    });

    act(() => {
      mockConn._emitMessage({ type: 'agent-left', agentId: 'a1' });
    });

    expect(result.current.agents).toEqual([
      {
        agentId: 'a2',
        machineId: 'm2',
        machineName: 'Desktop',
        agentType: 'claude',
        status: 'idle',
      },
    ]);
  });

  it('updates agent status on agent-status-changed message', () => {
    const { result } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitMessage({
        type: 'agents-list',
        agents: [
          {
            agentId: 'a1',
            machineId: 'm1',
            machineName: 'Laptop',
            agentType: 'claude',
            status: 'idle',
          },
        ],
      });
    });

    act(() => {
      mockConn._emitMessage({
        type: 'agent-status-changed',
        agentId: 'a1',
        status: 'running',
        activeTaskId: 'task-1',
      });
    });

    expect(result.current.agents[0]?.status).toBe('running');
  });

  it('reports connection state', () => {
    const { result } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    act(() => {
      mockConn._emitStateChange('connected');
    });

    expect(result.current.connectionState).toBe('connected');
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    unmount();

    expect(mockConn.disconnect).toHaveBeenCalled();
  });

  it('returns disconnected state when url is null', () => {
    const { result } = renderHook(() => usePersonalRoom(null));

    expect(result.current.connectionState).toBe('disconnected');
  });

  it('exposes the connection instance when url is provided', () => {
    const { result } = renderHook(() => usePersonalRoom({ url: 'ws://test' }));

    expect(result.current.connection).toBe(mockConn);
  });

  it('returns null connection when url is null', () => {
    const { result } = renderHook(() => usePersonalRoom(null));

    expect(result.current.connection).toBeNull();
  });
});
