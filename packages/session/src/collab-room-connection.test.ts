import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollabRoomConnection, type CollabRoomConnectionConfig } from './collab-room-connection';
import type { ConnectionState } from './personal-room-connection';
import type { CollabRoomServerMessage } from './schemas';

class MockWebSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  simulateError(error: unknown) {
    this.onerror?.(error);
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function createConnection(): { connection: CollabRoomConnection; ws: MockWebSocket } {
  let captured: MockWebSocket | undefined;

  const config: CollabRoomConnectionConfig = {
    url: 'ws://localhost:8787/collab/room1?token=abc',
    WebSocketImpl: class extends MockWebSocket {
      constructor(_url: string) {
        super();
        captured = this;
      }
    } as unknown as CollabRoomConnectionConfig['WebSocketImpl'],
  };

  const connection = new CollabRoomConnection(config);
  connection.connect();

  if (!captured) {
    throw new Error('WebSocket was not instantiated');
  }

  return { connection, ws: captured };
}

function createReconnectableConnection(overrides: Partial<CollabRoomConnectionConfig> = {}): {
  connection: CollabRoomConnection;
  instances: MockWebSocket[];
  latestWs: () => MockWebSocket;
} {
  const instances: MockWebSocket[] = [];

  const config: CollabRoomConnectionConfig = {
    url: 'ws://localhost:8787/collab/room1?token=abc',
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    ...overrides,
    WebSocketImpl: class extends MockWebSocket {
      constructor(_url: string) {
        super();
        instances.push(this);
      }
    } as unknown as CollabRoomConnectionConfig['WebSocketImpl'],
  };

  const connection = new CollabRoomConnection(config);

  return {
    connection,
    instances,
    latestWs: () => {
      const ws = instances[instances.length - 1];
      if (!ws) {
        throw new Error('No WebSocket instance created');
      }
      return ws;
    },
  };
}

describe('CollabRoomConnection', () => {
  it('starts in disconnected state', () => {
    const connection = new CollabRoomConnection({
      url: 'ws://localhost:8787/collab/room1?token=abc',
    });

    expect(connection.getState()).toBe('disconnected');
  });

  it('transitions to connecting on connect()', () => {
    const { connection } = createConnection();

    expect(connection.getState()).toBe('connecting');
  });

  it('transitions to connected when WebSocket opens', () => {
    const { connection, ws } = createConnection();

    ws.simulateOpen();

    expect(connection.getState()).toBe('connected');
  });

  it('sends JSON string when send() called', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const msg = {
      type: 'webrtc-offer' as const,
      targetUserId: 'user2',
      offer: { sdp: 'test' },
    };
    connection.send(msg);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('calls message handler with parsed server message', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    const serverMsg: CollabRoomServerMessage = {
      type: 'authenticated',
      userId: 'user1',
      username: 'testuser',
      taskId: 'task-1',
    };
    ws.simulateMessage(serverMsg);

    expect(handler).toHaveBeenCalledWith(serverMsg);
  });

  it('ignores malformed incoming messages', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    ws.onmessage?.({ data: 'not valid json{{{' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores messages that fail schema validation', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    ws.simulateMessage({ type: 'unknown-type', foo: 'bar' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('transitions to disconnected on WebSocket close', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    ws.simulateClose(1000, 'normal');

    expect(connection.getState()).toBe('disconnected');
  });

  it('transitions to error on WebSocket error', () => {
    const { connection, ws } = createConnection();

    ws.simulateError(new Error('connection failed'));

    expect(connection.getState()).toBe('error');
  });

  it('calls state change handler on state transitions', () => {
    const { connection, ws } = createConnection();
    const handler = vi.fn();
    connection.onStateChange(handler);

    ws.simulateOpen();

    expect(handler).toHaveBeenCalledWith('connected');
  });

  it('calls state change handler with each transition', () => {
    const { connection, ws } = createConnection();
    const states: ConnectionState[] = [];
    connection.onStateChange((state) => states.push(state));

    ws.simulateOpen();
    ws.simulateClose();

    expect(states).toEqual(['connected', 'disconnected']);
  });

  it('removes handler when unsubscribe function called', () => {
    const { connection, ws } = createConnection();
    const handler = vi.fn();
    const unsubscribe = connection.onStateChange(handler);

    unsubscribe();
    ws.simulateOpen();

    expect(handler).not.toHaveBeenCalled();
  });

  it('removes message handler when unsubscribe function called', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    const unsubscribe = connection.onMessage(handler);
    unsubscribe();

    const serverMsg: CollabRoomServerMessage = {
      type: 'authenticated',
      userId: 'user1',
      username: 'testuser',
      taskId: 'task-1',
    };
    ws.simulateMessage(serverMsg);

    expect(handler).not.toHaveBeenCalled();
  });

  it('closes WebSocket on disconnect()', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    connection.disconnect();

    expect(ws.close).toHaveBeenCalled();
  });

  it('transitions to disconnected after disconnect()', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    connection.disconnect();
    ws.simulateClose();

    expect(connection.getState()).toBe('disconnected');
  });

  it('is safe to call disconnect() when already disconnected', () => {
    const connection = new CollabRoomConnection({
      url: 'ws://localhost:8787/collab/room1?token=abc',
    });

    expect(() => connection.disconnect()).not.toThrow();
  });

  it('notifies multiple message handlers', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    connection.onMessage(handler1);
    connection.onMessage(handler2);

    const serverMsg: CollabRoomServerMessage = {
      type: 'authenticated',
      userId: 'user1',
      username: 'testuser',
      taskId: 'task-1',
    };
    ws.simulateMessage(serverMsg);

    expect(handler1).toHaveBeenCalledWith(serverMsg);
    expect(handler2).toHaveBeenCalledWith(serverMsg);
  });

  it('notifies multiple state change handlers', () => {
    const { connection, ws } = createConnection();

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    connection.onStateChange(handler1);
    connection.onStateChange(handler2);

    ws.simulateOpen();

    expect(handler1).toHaveBeenCalledWith('connected');
    expect(handler2).toHaveBeenCalledWith('connected');
  });

  it('handles participants-list message', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    const serverMsg: CollabRoomServerMessage = {
      type: 'participants-list',
      participants: [
        { userId: 'user1', username: 'alice', role: 'owner' },
        { userId: 'user2', username: 'bob', role: 'collaborator-full' },
      ],
    };
    ws.simulateMessage(serverMsg);

    expect(handler).toHaveBeenCalledWith(serverMsg);
  });

  it('handles participant-joined message', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    const serverMsg: CollabRoomServerMessage = {
      type: 'participant-joined',
      participant: { userId: 'user3', username: 'charlie', role: 'collaborator-full' },
    };
    ws.simulateMessage(serverMsg);

    expect(handler).toHaveBeenCalledWith(serverMsg);
  });

  it('handles participant-left message', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    const serverMsg: CollabRoomServerMessage = {
      type: 'participant-left',
      userId: 'user2',
    };
    ws.simulateMessage(serverMsg);

    expect(handler).toHaveBeenCalledWith(serverMsg);
  });
});

describe('auto-reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not reconnect by default (backwards compat)', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();
    ws.simulateClose();

    vi.advanceTimersByTime(60000);

    expect(connection.getState()).toBe('disconnected');
  });

  it('transitions to reconnecting after close when maxRetries configured', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: 3,
      initialDelayMs: 1000,
    });
    connection.connect();
    const ws = instances[instances.length - 1]!;
    ws.simulateOpen();
    ws.simulateClose();

    expect(connection.getState()).toBe('reconnecting');
  });

  it('reconnects after initial delay', () => {
    const { connection, instances } = createReconnectableConnection({ initialDelayMs: 1000 });
    connection.connect();
    const ws = instances[instances.length - 1]!;
    ws.simulateOpen();

    const countBefore = instances.length;
    ws.simulateClose();

    expect(connection.getState()).toBe('reconnecting');

    vi.advanceTimersByTime(1000);

    expect(instances.length).toBe(countBefore + 1);
    expect(connection.getState()).toBe('connecting');
  });

  it('uses exponential backoff', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: -1,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    });
    connection.connect();

    const ws0 = instances[instances.length - 1]!;
    ws0.simulateOpen();
    ws0.simulateClose();

    const expectedDelays = [1000, 2000, 4000];

    for (const delay of expectedDelays) {
      const countBefore = instances.length;

      vi.advanceTimersByTime(delay - 1);
      expect(instances.length).toBe(countBefore);

      vi.advanceTimersByTime(1);
      expect(instances.length).toBe(countBefore + 1);

      const ws = instances[instances.length - 1]!;
      ws.simulateClose();
    }
  });

  it('caps delay at maxDelayMs', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: -1,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    });
    connection.connect();

    const ws0 = instances[instances.length - 1]!;
    ws0.simulateOpen();
    ws0.simulateClose();

    for (let i = 0; i < 5; i++) {
      const expectedDelay = Math.min(1000 * 2 ** i, 5000);
      vi.advanceTimersByTime(expectedDelay);

      const ws = instances[instances.length - 1]!;
      ws.simulateClose();
    }

    const countBefore = instances.length;

    vi.advanceTimersByTime(4999);
    expect(instances.length).toBe(countBefore);

    vi.advanceTimersByTime(1);
    expect(instances.length).toBe(countBefore + 1);
  });

  it('stops retrying after maxRetries reached', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: 2,
      initialDelayMs: 1000,
    });
    connection.connect();

    const ws0 = instances[instances.length - 1]!;
    ws0.simulateOpen();
    ws0.simulateClose();
    vi.advanceTimersByTime(1000);

    const ws1 = instances[instances.length - 1]!;
    ws1.simulateClose();
    vi.advanceTimersByTime(2000);

    const countAfterRetries = instances.length;
    const ws2 = instances[instances.length - 1]!;
    ws2.simulateClose();

    vi.advanceTimersByTime(60000);
    expect(instances.length).toBe(countAfterRetries);
    expect(connection.getState()).toBe('disconnected');
  });

  it('retries infinitely when maxRetries is -1', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: -1,
      initialDelayMs: 100,
      maxDelayMs: 1000,
    });
    connection.connect();

    for (let i = 0; i < 7; i++) {
      const ws = instances[instances.length - 1]!;
      ws.simulateOpen();
      ws.simulateClose();
      vi.advanceTimersByTime(1000);
    }

    expect(instances.length).toBeGreaterThanOrEqual(8);
  });

  it('resets retry count on successful connection', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: -1,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    });
    connection.connect();

    const ws0 = instances[instances.length - 1]!;
    ws0.simulateOpen();
    ws0.simulateClose();
    vi.advanceTimersByTime(1000);

    const ws1 = instances[instances.length - 1]!;
    ws1.simulateClose();
    vi.advanceTimersByTime(2000);

    const ws2 = instances[instances.length - 1]!;
    ws2.simulateOpen();

    const countBefore = instances.length;
    ws2.simulateClose();

    vi.advanceTimersByTime(999);
    expect(instances.length).toBe(countBefore);

    vi.advanceTimersByTime(1);
    expect(instances.length).toBe(countBefore + 1);
  });

  it('disconnect() cancels pending reconnect', () => {
    const { connection, instances } = createReconnectableConnection({ initialDelayMs: 1000 });
    connection.connect();
    const ws = instances[instances.length - 1]!;
    ws.simulateOpen();
    ws.simulateClose();

    expect(connection.getState()).toBe('reconnecting');

    const countBefore = instances.length;
    connection.disconnect();

    vi.advanceTimersByTime(60000);

    expect(instances.length).toBe(countBefore);
    expect(connection.getState()).toBe('disconnected');
  });

  it('disconnect() prevents future reconnect attempts', () => {
    const { connection, instances } = createReconnectableConnection({ initialDelayMs: 1000 });
    connection.connect();
    const ws = instances[instances.length - 1]!;
    ws.simulateOpen();

    connection.disconnect();

    const countAfterDisconnect = instances.length;

    vi.advanceTimersByTime(60000);

    expect(instances.length).toBe(countAfterDisconnect);
    expect(connection.getState()).toBe('disconnected');
  });

  it('only schedules one reconnect when onerror fires followed by onclose', () => {
    const { connection, instances } = createReconnectableConnection({
      maxRetries: -1,
      initialDelayMs: 1000,
    });
    connection.connect();
    const ws = instances[instances.length - 1]!;
    ws.simulateOpen();

    const countBefore = instances.length;

    ws.simulateError(new Error('connection lost'));
    ws.simulateClose(1006, 'abnormal');

    expect(connection.getState()).toBe('reconnecting');

    vi.advanceTimersByTime(1000);

    expect(instances.length).toBe(countBefore + 1);
    expect(connection.getState()).toBe('connecting');
  });
});
