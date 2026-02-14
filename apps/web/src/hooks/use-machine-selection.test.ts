import type { AgentInfo as SignalingAgentInfo } from '@shipyard/session';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../stores';
import { mergeCapabilities, useMachineSelection } from './use-machine-selection';

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

describe('mergeCapabilities', () => {
  it('merges capabilities from multiple agents', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        capabilities: {
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          environments: [{ path: '/proj', name: 'proj', branch: 'main' }],
          permissionModes: ['default'],
        },
      }),
      makeAgent({
        agentId: 'a2',
        capabilities: {
          models: [{ id: 'sonnet', label: 'Sonnet', provider: 'claude-code' }],
          environments: [{ path: '/other', name: 'other', branch: 'dev' }],
          permissionModes: ['accept-edits'],
        },
      }),
    ];

    const result = mergeCapabilities(agents);
    expect(result.models).toHaveLength(2);
    expect(result.environments).toHaveLength(2);
    expect(result.permissionModes).toEqual(expect.arrayContaining(['default', 'accept-edits']));
  });

  it('deduplicates models by id', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        capabilities: {
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          environments: [],
          permissionModes: [],
        },
      }),
      makeAgent({
        agentId: 'a2',
        capabilities: {
          models: [
            {
              id: 'opus',
              label: 'Opus Dupe',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          environments: [],
          permissionModes: [],
        },
      }),
    ];

    const result = mergeCapabilities(agents);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]?.label).toBe('Opus');
  });

  it('returns empty when agents have no capabilities', () => {
    const agents: SignalingAgentInfo[] = [makeAgent({ agentId: 'a1' })];
    const result = mergeCapabilities(agents);
    expect(result.models).toEqual([]);
    expect(result.environments).toEqual([]);
    expect(result.permissionModes).toEqual([]);
  });

  it('extracts homeDir from first agent with homeDir capability', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        capabilities: {
          models: [],
          environments: [],
          permissionModes: [],
          homeDir: '/Users/test',
        },
      }),
      makeAgent({
        agentId: 'a2',
        capabilities: {
          models: [],
          environments: [],
          permissionModes: [],
        },
      }),
    ];

    const result = mergeCapabilities(agents);
    expect(result.homeDir).toBe('/Users/test');
  });

  it('returns undefined homeDir when no agent provides it', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        capabilities: {
          models: [],
          environments: [],
          permissionModes: [],
        },
      }),
    ];

    const result = mergeCapabilities(agents);
    expect(result.homeDir).toBeUndefined();
  });

  it('deduplicates permission modes', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        capabilities: {
          models: [],
          environments: [],
          permissionModes: ['default', 'bypass'],
        },
      }),
      makeAgent({
        agentId: 'a2',
        capabilities: {
          models: [],
          environments: [],
          permissionModes: ['default', 'accept-edits'],
        },
      }),
    ];

    const result = mergeCapabilities(agents);
    expect(result.permissionModes).toHaveLength(3);
    expect(result.permissionModes).toEqual(
      expect.arrayContaining(['default', 'accept-edits', 'bypass'])
    );
  });
});

describe('useMachineSelection', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('auto-selects the single machine when only one is connected', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        capabilities: {
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          environments: [],
          permissionModes: ['default'],
        },
      }),
    ];

    const { result } = renderHook(() => useMachineSelection(agents));
    expect(result.current.selectedMachineId).toBe('machine-1');
    expect(result.current.selectedMachine?.machineName).toBe('My Machine');
    expect(result.current.availableModels).toHaveLength(1);
  });

  it('returns empty arrays when no machines are connected', () => {
    const { result } = renderHook(() => useMachineSelection([]));
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
        capabilities: {
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          environments: [],
          permissionModes: [],
        },
      }),
      makeAgent({
        agentId: 'a2',
        machineId: 'machine-2',
        machineName: 'Machine B',
        capabilities: {
          models: [{ id: 'sonnet', label: 'Sonnet', provider: 'claude-code' }],
          environments: [],
          permissionModes: [],
        },
      }),
    ];

    const { result } = renderHook(() => useMachineSelection(agents));

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
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        capabilities: {
          models: [],
          environments: [],
          permissionModes: [],
          homeDir: '/Users/test',
        },
      }),
    ];

    const { result } = renderHook(() => useMachineSelection(agents));
    expect(result.current.homeDir).toBe('/Users/test');
  });

  it('returns undefined homeDir when no machine provides it', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        capabilities: {
          models: [],
          environments: [],
          permissionModes: [],
        },
      }),
    ];

    const { result } = renderHook(() => useMachineSelection(agents));
    expect(result.current.homeDir).toBeUndefined();
  });

  it('merges capabilities from multiple agents on the same machine', () => {
    const agents: SignalingAgentInfo[] = [
      makeAgent({
        agentId: 'a1',
        machineId: 'machine-1',
        capabilities: {
          models: [
            {
              id: 'opus',
              label: 'Opus',
              provider: 'claude-code',
              reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
            },
          ],
          environments: [{ path: '/proj', name: 'proj', branch: 'main' }],
          permissionModes: ['default'],
        },
      }),
      makeAgent({
        agentId: 'a2',
        machineId: 'machine-1',
        capabilities: {
          models: [{ id: 'sonnet', label: 'Sonnet', provider: 'claude-code' }],
          environments: [{ path: '/other', name: 'other', branch: 'dev' }],
          permissionModes: ['bypass'],
        },
      }),
    ];

    const { result } = renderHook(() => useMachineSelection(agents));
    expect(result.current.machines).toHaveLength(1);
    expect(result.current.availableModels).toHaveLength(2);
    expect(result.current.availableEnvironments).toHaveLength(2);
    expect(result.current.availablePermissionModes).toHaveLength(2);
  });
});
