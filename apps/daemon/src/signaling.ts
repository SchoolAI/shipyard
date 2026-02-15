import type { PersonalRoomClientMessage } from '@shipyard/session';
import { nanoid } from 'nanoid';

export interface SignalingConnection {
  send(msg: PersonalRoomClientMessage): void;
}

export interface DaemonSignalingConfig {
  connection: SignalingConnection;
  machineId: string;
  machineName: string;
  agentType: string;
}

export interface DaemonSignaling {
  register(): void;
  updateStatus(status: 'idle' | 'running' | 'error', taskId?: string): void;
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

    unregister() {
      send({
        type: 'unregister-agent',
        agentId,
      });
    },

    destroy() {},
  };
}
