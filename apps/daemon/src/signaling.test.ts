import type { PersonalRoomClientMessage } from '@shipyard/session';
import { describe, expect, it, vi } from 'vitest';
import { createDaemonSignaling } from './signaling.js';

function createMockConnection() {
  const send = vi.fn<(msg: PersonalRoomClientMessage) => void>();
  return { send };
}

const BASE_CONFIG = {
  machineId: 'machine-1',
  machineName: 'My Workstation',
  agentType: 'daemon',
} as const;

describe('createDaemonSignaling', () => {
  it('sends register-agent on register()', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.register();

    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'register-agent' }));
  });

  it('sends agent-status on updateStatus()', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.updateStatus('running');

    expect(conn.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent-status', status: 'running' })
    );
  });

  it('sends unregister-agent on unregister()', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.unregister();

    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'unregister-agent' }));
  });

  it('includes machineId and machineName in register message', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.register();

    expect(conn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: 'machine-1',
        machineName: 'My Workstation',
      })
    );
  });

  it('includes agentType in register message', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({
      connection: conn,
      ...BASE_CONFIG,
      agentType: 'custom-agent',
    });

    signaling.register();

    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ agentType: 'custom-agent' }));
  });

  it('updateStatus includes taskId when provided', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.updateStatus('running', 'task-abc-123');

    expect(conn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent-status',
        status: 'running',
        activeTaskId: 'task-abc-123',
      })
    );
  });
});
