import type { MachineCapabilitiesEphemeralValue } from '@shipyard/loro-schema';
import type { AgentInfo as SignalingAgentInfo } from '@shipyard/session';
import { useEffect, useMemo } from 'react';
import { useUIStore } from '../stores';

/** Capabilities for a single model (from ephemeral). */
export type ModelInfo = MachineCapabilitiesEphemeralValue['models'][number];

/** Reasoning capability for models that support configurable effort. */
export type ReasoningCapability = NonNullable<ModelInfo['reasoning']>;

/** Capabilities for a single environment (from ephemeral). */
export type GitRepoInfo = MachineCapabilitiesEphemeralValue['environments'][number];

const EMPTY_CAPABILITIES: MachineCapabilitiesEphemeralValue = {
  models: [],
  environments: [],
  permissionModes: [],
  homeDir: null,
};

export interface MachineGroup {
  machineId: string;
  machineName: string;
  agents: SignalingAgentInfo[];
  capabilities: MachineCapabilitiesEphemeralValue;
}

/**
 * Derive machine groups from signaling agents + ephemeral capabilities.
 *
 * Agents provide online/offline status and machine identity (from signaling).
 * Capabilities provide models, environments, permissionModes, homeDir (from Loro ephemeral).
 */
export function useMachineSelection(
  agents: SignalingAgentInfo[],
  capabilitiesByMachine: Map<string, MachineCapabilitiesEphemeralValue>
) {
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
          capabilities: capabilitiesByMachine.get(agent.machineId) ?? EMPTY_CAPABILITIES,
        };
        map.set(agent.machineId, group);
      }
      group.agents.push(agent);
    }
    return [...map.values()];
  }, [agents, capabilitiesByMachine]);

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

  const homeDir = selectedMachine?.capabilities.homeDir ?? undefined;

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
