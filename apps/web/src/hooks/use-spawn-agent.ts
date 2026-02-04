import { useRepo } from '@loro-extended/react';
import { TaskDocumentSchema, type TaskId } from '@shipyard/loro-schema';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

export interface SpawnAgentOptions {
  taskId: TaskId;
  prompt: string;
  cwd?: string;
  targetMachineId?: string;
  actor: string;
}

export interface SpawnAgentResult {
  requestId: string;
}

export interface UseSpawnAgentReturn {
  spawnAgent: (options: SpawnAgentOptions) => SpawnAgentResult;
  isSpawning: boolean;
}

export function useSpawnAgent(): UseSpawnAgentReturn {
  const repo = useRepo();
  const [isSpawning, setIsSpawning] = useState(false);

  const spawnAgent = useCallback(
    (options: SpawnAgentOptions): SpawnAgentResult => {
      setIsSpawning(true);

      const { taskId, prompt, cwd = '/tmp', targetMachineId, actor } = options;

      const requestId = nanoid();
      const handle = repo.get(taskId, TaskDocumentSchema);

      handle.change((doc) => {
        doc.events.push({
          id: requestId,
          type: 'spawn_requested',
          actor,
          timestamp: Date.now(),
          inboxWorthy: null,
          inboxFor: null,
          targetMachineId: targetMachineId ?? 'default',
          prompt,
          cwd,
          requestedBy: actor,
        });
      });

      setIsSpawning(false);

      return { requestId };
    },
    [repo]
  );

  return { spawnAgent, isSpawning };
}
