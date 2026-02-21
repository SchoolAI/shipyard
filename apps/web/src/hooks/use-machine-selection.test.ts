import type { MachineCapabilitiesEphemeralValue } from '@shipyard/loro-schema';
import type { AgentInfo as SignalingAgentInfo } from '@shipyard/session';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../stores';
import { useMachineSelection } from './use-machine-selection';

function makeAgent(overrides: Partial<SignalingAgentInfo> = {}): SignalingAgentInfo {
  return {
    agentId: 'agent-1',
    machineId: 'machine-1',
    machineName: 'My Machine',
    agentType: 'claude-code',
    status: 'idle',
    ...overrides,
  };
}

function makeCaps(
  overrides: Partial<MachineCapabilitiesEphemeralValue> = {}
): MachineCapabilitiesEphemeralValue {
  return {
    models: [],
    environments: [],
    permissionModes: [],
    homeDir: null,
    anthropicAuth: null,
    ...overrides,
  };
}

const EMPTY_CAPS = new Map<string, MachineCapabilitiesEphemeralValue>();

describe('useMachineSelection', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('auto-selects the single machine when only one is connected', () => {
    const agents: SignalingAgentInfo[] = [makeAgent()];
    const caps = new Map([
      [
        'machine-1',
        makeCaps({
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          permissionModes: ['default'],
        }),
      ],
    ]);

    const { result } = renderHook(() => useMachineSelection(agents, caps));
    expect(result.current.selectedMachineId).toBe('machine-1');
    expect(result.current.selectedMachine?.machineName).toBe('My Machine');
    expect(result.current.availableModels).toHaveLength(1);
  });

  it('returns empty arrays when no machines are connected', () => {
    const { result } = renderHook(() => useMachineSelection([], EMPTY_CAPS));
    expect(result.current.machines).toEqual([]);
    expect(result.current.selectedMachineId).toBe(null);
    expect(result.current.selectedMachine).toBe(null);
    expect(result.current.availableModels).toEqual([]);
    expect(result.current.availableEnvironments).toEqual([]);
    expect(result.current.availablePermissionModes).toEqual([]);
  });

  it('handles machine selection changes', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        machineId: 'machine-1',
        machineName: 'Machine A',
      }),
      makeAgent({
        agentId: 'a2',
        machineId: 'machine-2',
        machineName: 'Machine B',
      }),
    ];
    const caps = new Map<string, MachineCapabilitiesEphemeralValue>([
      [
        'machine-1',
        makeCaps({
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
        }),
      ],
      [
        'machine-2',
        makeCaps({
          models: [{ id: 'sonnet', label: 'Sonnet', provider: 'claude-code', reasoning: null }],
        }),
      ],
    ]);

    const { result } = renderHook(() => useMachineSelection(agents, caps));

    expect(result.current.machines).toHaveLength(2);
    expect(result.current.selectedMachineId).toBe('machine-1');
    expect(result.current.availableModels[0]?.id).toBe('opus');

    act(() => {
      result.current.setSelectedMachineId('machine-2');
    });

    expect(result.current.selectedMachineId).toBe('machine-2');
    expect(result.current.selectedMachine?.machineName).toBe('Machine B');
    expect(result.current.availableModels[0]?.id).toBe('sonnet');
  });

  it('exposes homeDir from selected machine capabilities', () => {
    const agents: SignalingAgentInfo[] = [makeAgent()];
    const caps = new Map([['machine-1', makeCaps({ homeDir: '/Users/test' })]]);

    const { result } = renderHook(() => useMachineSelection(agents, caps));
    expect(result.current.homeDir).toBe('/Users/test');
  });

  it('returns undefined homeDir when no machine provides it', () => {
    const agents: SignalingAgentInfo[] = [makeAgent()];
    const caps = new Map([['machine-1', makeCaps({ homeDir: null })]]);

    const { result } = renderHook(() => useMachineSelection(agents, caps));
    expect(result.current.homeDir).toBeUndefined();
  });

  it('uses empty capabilities when ephemeral has no entry for machine', () => {
    const agents: SignalingAgentInfo[] = [makeAgent()];

    const { result } = renderHook(() => useMachineSelection(agents, EMPTY_CAPS));
    expect(result.current.machines).toHaveLength(1);
    expect(result.current.availableModels).toEqual([]);
    expect(result.current.availableEnvironments).toEqual([]);
    expect(result.current.availablePermissionModes).toEqual([]);
  });

  it('groups multiple agents on the same machine with shared ephemeral capabilities', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({ agentId: 'a1', machineId: 'machine-1' }),
      makeAgent({ agentId: 'a2', machineId: 'machine-1' }),
    ];
    const caps = new Map([
      [
        'machine-1',
        makeCaps({
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
            { id: 'sonnet', label: 'Sonnet', provider: 'claude-code', reasoning: null },
          ],
          environments: [
            { path: '/proj', name: 'proj', branch: 'main', remote: null },
            { path: '/other', name: 'other', branch: 'dev', remote: null },
          ],
          permissionModes: ['default', 'bypass'],
        }),
      ],
    ]);

    const { result } = renderHook(() => useMachineSelection(agents, caps));
    expect(result.current.machines).toHaveLength(1);
    expect(result.current.machines[0]?.agents).toHaveLength(2);
    expect(result.current.availableModels).toHaveLength(2);
    expect(result.current.availableEnvironments).toHaveLength(2);
    expect(result.current.availablePermissionModes).toHaveLength(2);
  });
});
