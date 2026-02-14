import type { MachineCapabilities, PersonalRoomClientMessage } from '@shipyard/session';
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

const FAKE_CAPABILITIES: MachineCapabilities = {
  models: [
    {
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      provider: 'claude-code',
      supportsReasoning: true,
    },
  ],
  environments: [
    {
      path: '/home/user/project',
      name: 'project',
      branch: 'main',
      remote: 'git@github.com:user/project.git',
    },
  ],
  permissionModes: ['default', 'accept-edits', 'bypass'],
};

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

  it('register() includes capabilities when provided', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({
      connection: conn,
      ...BASE_CONFIG,
      capabilities: FAKE_CAPABILITIES,
    });

    signaling.register();

    expect(conn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'register-agent',
        capabilities: FAKE_CAPABILITIES,
      })
    );
  });

  it('register() omits capabilities when not provided', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.register();

    const sentMsg = conn.send.mock.calls[0]?.[0];
    expect(sentMsg).toBeDefined();
    expect(sentMsg?.type).toBe('register-agent');
    expect('capabilities' in (sentMsg ?? {})).toBe(false);
  });

  it('updateCapabilities() sends update-capabilities message', () => {
    const conn = createMockConnection();
    const signaling = createDaemonSignaling({ connection: conn, ...BASE_CONFIG });

    signaling.updateCapabilities(FAKE_CAPABILITIES);

    expect(conn.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'update-capabilities',
        capabilities: FAKE_CAPABILITIES,
      })
    );
  });
});
