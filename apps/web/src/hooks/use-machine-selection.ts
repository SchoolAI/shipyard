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

function dedupeModels(caps: MachineCapabilities[]): ModelInfo[] {
  const seen = new Set<string>();
  const result: ModelInfo[] = [];
  for (const c of caps) {
    for (const model of c.models) {
      if (!seen.has(model.id)) {
        seen.add(model.id);
        result.push(model);
      }
    }
  }
  return result;
}

function dedupeEnvironments(caps: MachineCapabilities[]): GitRepoInfo[] {
  const seen = new Set<string>();
  const result: GitRepoInfo[] = [];
  for (const c of caps) {
    for (const env of c.environments) {
      if (!seen.has(env.path)) {
        seen.add(env.path);
        result.push(env);
      }
    }
  }
  return result;
}

export function mergeCapabilities(agents: SignalingAgentInfo[]): MachineCapabilities {
  const caps = agents.map((a) => a.capabilities).filter((c): c is MachineCapabilities => c != null);

  const permissionModes = new Set<PermissionMode>();
  for (const c of caps) {
    for (const mode of c.permissionModes) {
      permissionModes.add(mode);
    }
  }

  const homeDir = caps.find((c) => c.homeDir)?.homeDir;

  return {
    models: dedupeModels(caps),
    environments: dedupeEnvironments(caps),
    permissionModes: [...permissionModes],
    homeDir,
  };
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

  const availableModels = useMemo(
    () => selectedMachine?.capabilities.models ?? [],
    [selectedMachine]
  );
  const availableEnvironments = useMemo(
    () => selectedMachine?.capabilities.environments ?? [],
    [selectedMachine]
  );
  const availablePermissionModes = useMemo(
    () => selectedMachine?.capabilities.permissionModes ?? [],
    [selectedMachine]
  );

  const homeDir = selectedMachine?.capabilities.homeDir;

  return {
    machines,
    selectedMachineId: effectiveMachineId,
    setSelectedMachineId,
    selectedMachine,
    availableModels,
    availableEnvironments,
    availablePermissionModes,
    homeDir,
  };
}
