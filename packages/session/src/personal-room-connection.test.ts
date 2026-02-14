import { describe, expect, it, vi } from 'vitest';
import {
  type ConnectionState,
  PersonalRoomConnection,
  type PersonalRoomConnectionConfig,
} from './personal-room-connection';
import type { PersonalRoomServerMessage } from './schemas';

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

function createConnection(): { connection: PersonalRoomConnection; ws: MockWebSocket } {
  let captured: MockWebSocket | undefined;

  const config: PersonalRoomConnectionConfig = {
    url: 'ws://localhost:8787/personal/user1?token=abc',
    WebSocketImpl: class extends MockWebSocket {
      constructor(_url: string) {
        super();
        captured = this;
      }
    } as unknown as PersonalRoomConnectionConfig['WebSocketImpl'],
  };

  const connection = new PersonalRoomConnection(config);
  connection.connect();

  if (!captured) {
    throw new Error('WebSocket was not instantiated');
  }

  return { connection, ws: captured };
}

describe('PersonalRoomConnection', () => {
  it('starts in disconnected state', () => {
    const connection = new PersonalRoomConnection({
      url: 'ws://localhost:8787/personal/user1?token=abc',
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
      type: 'register-agent' as const,
      agentId: 'a1',
      machineId: 'm1',
      machineName: 'Machine 1',
      agentType: 'claude',
    };
    connection.send(msg);

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('calls message handler with parsed server message', () => {
    const { connection, ws } = createConnection();
    ws.simulateOpen();

    const handler = vi.fn();
    connection.onMessage(handler);

    const serverMsg: PersonalRoomServerMessage = {
      type: 'authenticated',
      userId: 'user1',
      username: 'testuser',
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

    const serverMsg: PersonalRoomServerMessage = {
      type: 'authenticated',
      userId: 'user1',
      username: 'testuser',
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
    const connection = new PersonalRoomConnection({
      url: 'ws://localhost:8787/personal/user1?token=abc',
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

    const serverMsg: PersonalRoomServerMessage = {
      type: 'authenticated',
      userId: 'user1',
      username: 'testuser',
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
});
