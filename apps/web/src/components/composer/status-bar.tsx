import { Button, Chip, Dropdown, Label, Tooltip } from '@heroui/react';
import type {
  GitRepoInfo,
  PermissionMode,
  AgentInfo as SignalingAgentInfo,
} from '@shipyard/session';
import { ChevronDown, GitBranch, Monitor, Shield } from 'lucide-react';
import { useMemo } from 'react';
import type { MachineGroup } from '../../hooks/use-machine-selection';
import type { ConnectionState } from '../../hooks/use-personal-room';
import { EnvironmentPicker } from './environment-picker';

const PERMISSION_LABELS: Record<PermissionMode, string> = {
  default: 'Default permissions',
  'accept-edits': 'Accept edits',
  bypass: 'Bypass permissions',
};

const ALL_PERMISSION_MODES: PermissionMode[] = ['default', 'accept-edits', 'bypass'];

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
  availablePermissionModes?: PermissionMode[];
  permission?: PermissionMode;
  onPermissionChange?: (mode: PermissionMode) => void;
}

export function StatusBar({
  connectionState = 'disconnected',
  machines,
  selectedMachineId,
  onMachineSelect,
  availableEnvironments = [],
  selectedEnvironmentPath,
  onEnvironmentSelect,
  availablePermissionModes,
  permission = 'default',
  onPermissionChange,
}: StatusBarProps) {
  const machineKeys = useMemo(
    () => (selectedMachineId ? new Set([selectedMachineId]) : new Set<string>()),
    [selectedMachineId]
  );

  const permissionModes =
    availablePermissionModes && availablePermissionModes.length > 0
      ? availablePermissionModes
      : ALL_PERMISSION_MODES;

  const permissionKeys = useMemo(() => new Set([permission]), [permission]);

  const selectedEnvironment = availableEnvironments.find((e) => e.path === selectedEnvironmentPath);

  const permissionLabel = PERMISSION_LABELS[permission] ?? 'Default permissions';
  const machinesLabel = machineLabel(machines, connectionState);
  const branchLabel = selectedEnvironment ? selectedEnvironment.branch : 'main';

  return (
    <div
      className="w-full max-w-3xl mx-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="status"
      aria-label="Connection status"
    >
      <div className="flex items-center gap-x-3 text-xs text-muted overflow-hidden">
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
                  <span className="truncate max-w-[8rem]">{machinesLabel}</span>
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
          <span className="flex items-center gap-1 min-w-0">
            <Monitor className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[8rem]">{machinesLabel}</span>
          </span>
        )}

        {/* Permissions */}
        <Dropdown>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Permissions: ${permissionLabel}`}
            className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
          >
            <Shield className="w-3 h-3" aria-hidden="true" />
            {permissionLabel}
            <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
          </Button>
          <Dropdown.Popover placement="top" className="min-w-[180px]">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={permissionKeys}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (
                  typeof selected === 'string' &&
                  (selected === 'default' ||
                    selected === 'accept-edits' ||
                    selected === 'bypass') &&
                  onPermissionChange
                ) {
                  onPermissionChange(selected);
                }
              }}
            >
              {permissionModes.map((mode) => (
                <Dropdown.Item key={mode} id={mode} textValue={PERMISSION_LABELS[mode]}>
                  <Label>{PERMISSION_LABELS[mode]}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        {/* Environment */}
        <EnvironmentPicker
          environments={availableEnvironments}
          selectedPath={selectedEnvironmentPath ?? null}
          onSelect={onEnvironmentSelect ?? (() => {})}
        />

        {/* Branch */}
        <Tooltip>
          <Tooltip.Trigger>
            <span className="flex items-center gap-1 min-w-0 shrink" role="status">
              <GitBranch className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{branchLabel}</span>
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>{branchLabel}</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
