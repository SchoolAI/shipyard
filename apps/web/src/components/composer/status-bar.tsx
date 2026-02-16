import { Button, Chip, Dropdown, Label, Tooltip } from '@heroui/react';
import type { AgentInfo as SignalingAgentInfo } from '@shipyard/session';
import { AlertCircle, ChevronDown, GitBranch, Monitor } from 'lucide-react';
import { useMemo } from 'react';
import type { GitRepoInfo, MachineGroup } from '../../hooks/use-machine-selection';
import type { ConnectionState } from '../../hooks/use-personal-room';
import { EnvironmentPicker } from './environment-picker';

const STATUS_COLOR: Record<SignalingAgentInfo['status'], 'success' | 'warning' | 'danger'> = {
  idle: 'success',
  running: 'warning',
  error: 'danger',
};

function machineLabel(machines: MachineGroup[], connectionState: ConnectionState): string {
  if (connectionState !== 'connected' || machines.length === 0) {
    return 'No machines';
  }
  if (machines.length === 1) {
    const machine = machines[0];
    if (machine) return machine.machineName;
  }
  return `${machines.length} machines`;
}

export interface StatusBarProps {
  connectionState?: ConnectionState;
  machines: MachineGroup[];
  selectedMachineId?: string | null;
  onMachineSelect?: (machineId: string) => void;
  availableEnvironments?: GitRepoInfo[];
  selectedEnvironmentPath?: string | null;
  onEnvironmentSelect?: (path: string | null) => void;
  homeDir?: string;
}

export function StatusBar({
  connectionState = 'disconnected',
  machines,
  selectedMachineId,
  onMachineSelect,
  availableEnvironments = [],
  selectedEnvironmentPath,
  onEnvironmentSelect,
  homeDir,
}: StatusBarProps) {
  const machineKeys = useMemo(
    () => (selectedMachineId ? new Set([selectedMachineId]) : new Set<string>()),
    [selectedMachineId]
  );

  const selectedEnvironment = availableEnvironments.find((e) => e.path === selectedEnvironmentPath);

  const machinesLabel = machineLabel(machines, connectionState);
  const isSelectedHomeDir = selectedEnvironment && homeDir && selectedEnvironment.path === homeDir;
  const isUsingHomeDir = !selectedEnvironment && homeDir;
  const isHomeDir = isSelectedHomeDir || isUsingHomeDir;
  const branchLabel = isHomeDir ? '~' : selectedEnvironment ? selectedEnvironment.branch : 'main';

  return (
    <div
      className="w-full max-w-3xl mx-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      role="status"
      aria-label="Connection status"
    >
      <div className="flex items-center flex-nowrap gap-x-2 gap-y-1 text-xs text-muted sm:gap-x-3 overflow-hidden">
        {/* Machine picker */}
        <div className="flex items-center min-w-0">
          {machines.length > 0 ? (
            <Dropdown>
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Machines: ${machinesLabel}`}
                    className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
                  >
                    <Monitor className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[4rem] sm:max-w-[6rem]">{machinesLabel}</span>
                    <ChevronDown className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>{machinesLabel}</Tooltip.Content>
              </Tooltip>
              <Dropdown.Popover placement="top" className="min-w-[200px]">
                <Dropdown.Menu
                  selectionMode="single"
                  selectedKeys={machineKeys}
                  onSelectionChange={(keys) => {
                    const selected = [...keys][0];
                    if (typeof selected === 'string' && onMachineSelect) {
                      onMachineSelect(selected);
                    }
                  }}
                >
                  {machines.map((machine) => (
                    <Dropdown.Item
                      key={machine.machineId}
                      id={machine.machineId}
                      textValue={machine.machineName}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <Label>{machine.machineName}</Label>
                        <div className="flex gap-1">
                          {machine.agents.map((agent) => (
                            <Chip
                              key={agent.agentId}
                              size="sm"
                              variant="soft"
                              color={STATUS_COLOR[agent.status]}
                            >
                              {agent.status}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : (
            <span className="flex items-center gap-1 min-w-0 text-warning">
              <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[4rem] sm:max-w-[6rem]">{machinesLabel}</span>
            </span>
          )}
        </div>

        {/* Environment */}
        <EnvironmentPicker
          environments={availableEnvironments}
          selectedPath={selectedEnvironmentPath ?? null}
          onSelect={onEnvironmentSelect ?? (() => {})}
          homeDir={homeDir}
        />

        {/* Branch -- only shown for real project environments */}
        {selectedEnvironment && !isHomeDir && (
          <Tooltip>
            <Tooltip.Trigger>
              <span
                className="flex items-center gap-1 min-w-0 max-w-[5rem] sm:max-w-[7rem]"
                role="status"
              >
                <GitBranch className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{branchLabel}</span>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>{branchLabel}</Tooltip.Content>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
