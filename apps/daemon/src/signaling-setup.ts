import { hostname } from 'node:os';
import type { MachineCapabilities } from '@shipyard/session';
import { PersonalRoomConnection } from '@shipyard/session';
import { detectCapabilities } from './capabilities.js';
import type { Env } from './env.js';
import type { createChildLogger } from './logger.js';
import { createDaemonSignaling, type DaemonSignaling } from './signaling.js';

export interface SignalingHandle {
  signaling: DaemonSignaling;
  connection: PersonalRoomConnection;
  capabilities: MachineCapabilities;
}

/**
 * Build the WebSocket URL, detect machine capabilities, create
 * PersonalRoomConnection + DaemonSignaling, and wire auto-register
 * on connect.
 *
 * Returns null when SHIPYARD_SIGNALING_URL is not configured.
 */
export async function createSignalingHandle(
  env: Env,
  log: ReturnType<typeof createChildLogger>
): Promise<SignalingHandle | null> {
  if (!env.SHIPYARD_SIGNALING_URL) {
    return null;
  }

  const machineId = env.SHIPYARD_MACHINE_ID ?? hostname();
  const machineName = env.SHIPYARD_MACHINE_NAME ?? hostname();
  const wsUrl = new URL(env.SHIPYARD_SIGNALING_URL);
  if (env.SHIPYARD_USER_TOKEN) {
    wsUrl.searchParams.set('token', env.SHIPYARD_USER_TOKEN);
  }
  wsUrl.searchParams.set('clientType', 'agent');

  const capabilities = await detectCapabilities();
  log.info(
    { models: capabilities.models.length, environments: capabilities.environments.length },
    'Detected machine capabilities'
  );

  const connection = new PersonalRoomConnection({ url: wsUrl.toString() });
  const signaling = createDaemonSignaling({
    connection,
    machineId,
    machineName,
    agentType: 'daemon',
    capabilities,
  });

  connection.onStateChange((state) => {
    if (state === 'connected') {
      signaling.register();
      log.info({ machineId, machineName }, 'Registered with signaling server');
    }
  });

  return { signaling, connection, capabilities };
}
