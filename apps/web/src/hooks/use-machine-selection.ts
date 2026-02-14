import type {
  GitRepoInfo,
  MachineCapabilities,
  ModelInfo,
  PermissionMode,
  AgentInfo as SignalingAgentInfo,
} from '@shipyard/session';
import { useEffect, useMemo } from 'react';
import { useUIStore } from '../stores';

export interface MachineGroup {
  machineId: string;
  machineName: string;
  agents: SignalingAgentInfo[];
  capabilities: MachineCapabilities;
}

export function mergeCapabilities(agents: SignalingAgentInfo[]): MachineCapabilities {
  const models: ModelInfo[] = [];
  const environments: GitRepoInfo[] = [];
  const permissionModes = new Set<PermissionMode>();
  const seenModelIds = new Set<string>();
  const seenEnvPaths = new Set<string>();

  for (const agent of agents) {
    if (!agent.capabilities) continue;
    for (const model of agent.capabilities.models) {
      if (!seenModelIds.has(model.id)) {
        seenModelIds.add(model.id);
        models.push(model);
      }
    }
    for (const env of agent.capabilities.environments) {
      if (!seenEnvPaths.has(env.path)) {
        seenEnvPaths.add(env.path);
        environments.push(env);
      }
    }
    for (const mode of agent.capabilities.permissionModes) {
      permissionModes.add(mode);
    }
  }

  return { models, environments, permissionModes: [...permissionModes] };
}

export function useMachineSelection(agents: SignalingAgentInfo[]) {
  const selectedMachineId = useUIStore((s) => s.selectedMachineId);
  const setSelectedMachineId = useUIStore((s) => s.setSelectedMachineId);

  const machines = useMemo(() => {
    const map = new Map<string, MachineGroup>();
    for (const agent of agents) {
      let group = map.get(agent.machineId);
      if (!group) {
        group = {
          machineId: agent.machineId,
          machineName: agent.machineName,
          agents: [],
          capabilities: { models: [], environments: [], permissionModes: [] },
        };
        map.set(agent.machineId, group);
      }
      group.agents.push(agent);
    }
    for (const group of map.values()) {
      group.capabilities = mergeCapabilities(group.agents);
    }
    return [...map.values()];
  }, [agents]);

  const machineStillConnected = machines.some((m) => m.machineId === selectedMachineId);
  const effectiveMachineId =
    selectedMachineId && machineStillConnected
      ? selectedMachineId
      : (machines[0]?.machineId ?? null);
  useEffect(() => {
    if (effectiveMachineId !== selectedMachineId) {
      setSelectedMachineId(effectiveMachineId);
    }
  }, [effectiveMachineId, selectedMachineId, setSelectedMachineId]);

  const selectedMachine = machines.find((m) => m.machineId === effectiveMachineId) ?? null;

  return {
    machines,
    selectedMachineId: effectiveMachineId,
    setSelectedMachineId,
    selectedMachine,
    availableModels: selectedMachine?.capabilities.models ?? [],
    availableEnvironments: selectedMachine?.capabilities.environments ?? [],
    availablePermissionModes: selectedMachine?.capabilities.permissionModes ?? [],
  };
}
