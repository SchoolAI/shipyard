import type { MachineCapabilities, PersonalRoomClientMessage } from '@shipyard/session';
import { nanoid } from 'nanoid';

export interface SignalingConnection {
  send(msg: PersonalRoomClientMessage): void;
}

export interface DaemonSignalingConfig {
  connection: SignalingConnection;
  machineId: string;
  machineName: string;
  agentType: string;
  capabilities?: MachineCapabilities;
}

export interface DaemonSignaling {
  register(): void;
  updateStatus(status: 'idle' | 'running' | 'error', taskId?: string): void;
  updateCapabilities(capabilities: MachineCapabilities): void;
  unregister(): void;
  destroy(): void;
}

export function createDaemonSignaling(config: DaemonSignalingConfig): DaemonSignaling {
  const agentId = nanoid();

  function send(msg: PersonalRoomClientMessage): void {
    config.connection.send(msg);
  }

  return {
    register() {
      send({
        type: 'register-agent',
        agentId,
        machineId: config.machineId,
        machineName: config.machineName,
        agentType: config.agentType,
        ...(config.capabilities && { capabilities: config.capabilities }),
      });
    },

    updateStatus(status, taskId) {
      send({
        type: 'agent-status',
        agentId,
        status,
        ...(taskId !== undefined && { activeTaskId: taskId }),
      });
    },

    updateCapabilities(capabilities) {
      send({
        type: 'update-capabilities',
        agentId,
        capabilities,
      });
    },

    unregister() {
      send({
        type: 'unregister-agent',
        agentId,
      });
    },

    destroy() {},
  };
}
