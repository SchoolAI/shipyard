import type { TaskId } from '@shipyard/loro-schema';
import { useCallback, useMemo, useState } from 'react';
import { useDaemon } from './use-daemon';
import { type ConnectedPeer, useP2PPeers } from './use-p2p-peers';
import { type SpawnAgentOptions, type SpawnAgentResult, useSpawnAgent } from './use-spawn-agent';
import { type SpawnStatus, useSpawnStatus } from './use-spawn-status';

export type SpawnMethod = 'direct' | 'peer' | 'none';

export interface DaemonSpawnState {
  isDaemonAvailable: boolean;
  isCheckingDaemon: boolean;
  peersWithDaemon: ConnectedPeer[];
  spawnMethod: SpawnMethod;
  canSpawn: boolean;
}

export interface UseDaemonSpawnOptions {
  taskId?: TaskId;
  selectedPeerId?: string | null;
}

export interface UseDaemonSpawnReturn extends DaemonSpawnState {
  spawn: (
    options: Omit<SpawnAgentOptions, 'targetMachineId'> & {
      targetMachineId?: string;
    }
  ) => SpawnAgentResult | null;
  spawnStatus: SpawnStatus;
  lastRequestId: string | null;
  checkDaemonHealth: () => Promise<void>;
}

export function useDaemonSpawn(options: UseDaemonSpawnOptions = {}): UseDaemonSpawnReturn {
  const { taskId, selectedPeerId } = options;

  const { isAvailable: isDaemonAvailable, isChecking: isCheckingDaemon, checkHealth } = useDaemon();

  const { connectedPeers } = useP2PPeers();
  const peersWithDaemon = useMemo(
    () => connectedPeers.filter((peer) => peer.hasDaemon === true),
    [connectedPeers]
  );

  const { spawnAgent } = useSpawnAgent();

  const [lastRequestId, setLastRequestId] = useState<string | null>(null);

  const spawnStatus = useSpawnStatus(taskId ?? null, lastRequestId);

  const spawnMethod = useMemo((): SpawnMethod => {
    if (isDaemonAvailable) return 'direct';
    if (peersWithDaemon.length > 0 && selectedPeerId) return 'peer';
    return 'none';
  }, [isDaemonAvailable, peersWithDaemon.length, selectedPeerId]);

  const canSpawn = spawnMethod !== 'none';

  const spawn = useCallback(
    (
      spawnOptions: Omit<SpawnAgentOptions, 'targetMachineId'> & {
        targetMachineId?: string;
      }
    ): SpawnAgentResult | null => {
      if (!canSpawn) {
        return null;
      }

      let targetMachineId = spawnOptions.targetMachineId;
      if (!targetMachineId) {
        if (spawnMethod === 'direct') {
          targetMachineId = 'default';
        } else if (spawnMethod === 'peer' && selectedPeerId) {
          targetMachineId = selectedPeerId;
        }
      }

      const result = spawnAgent({
        ...spawnOptions,
        targetMachineId,
      });

      setLastRequestId(result.requestId);
      return result;
    },
    [canSpawn, spawnMethod, selectedPeerId, spawnAgent]
  );

  const checkDaemonHealth = useCallback(async (): Promise<void> => {
    await checkHealth();
  }, [checkHealth]);

  return {
    isDaemonAvailable,
    isCheckingDaemon,
    peersWithDaemon,
    spawnMethod,
    canSpawn,
    spawn,
    spawnStatus,
    lastRequestId,
    checkDaemonHealth,
  };
}
