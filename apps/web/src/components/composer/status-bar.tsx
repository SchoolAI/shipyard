import { Button, Chip, Dropdown, Label, ScrollShadow } from '@heroui/react';
import type {
  GitRepoInfo,
  PermissionMode,
  AgentInfo as SignalingAgentInfo,
} from '@shipyard/session';
import { ChevronDown, GitBranch, Globe, Monitor, Shield } from 'lucide-react';
import { useMemo } from 'react';
import type { MachineGroup } from '../../hooks/use-machine-selection';
import type { ConnectionState } from '../../hooks/use-personal-room';

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

  const sortedEnvironments = useMemo(
    () => [...availableEnvironments].sort((a, b) => a.name.localeCompare(b.name)),
    [availableEnvironments]
  );

  const selectedEnvironment = sortedEnvironments.find((e) => e.path === selectedEnvironmentPath);
  const envKeys = useMemo(
    () => (selectedEnvironmentPath ? new Set([selectedEnvironmentPath]) : new Set<string>()),
    [selectedEnvironmentPath]
  );

  const permissionLabel = PERMISSION_LABELS[permission] ?? 'Default permissions';
  const envLabel = selectedEnvironment
    ? `${selectedEnvironment.name} (${selectedEnvironment.branch})`
    : availableEnvironments.length > 0
      ? 'Select environment'
      : 'No environment';
  const machinesLabel = machineLabel(machines, connectionState);
  const branchLabel = selectedEnvironment ? `From ${selectedEnvironment.branch}` : 'From main';

  return (
    <div className="w-full max-w-3xl mx-auto pb-3" role="status" aria-label="Connection status">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {machines.length > 0 ? (
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Machines: ${machinesLabel}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
            >
              <Monitor className="w-3 h-3" aria-hidden="true" />
              {machinesLabel}
              <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
            </Button>
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
          <span className="flex items-center gap-1">
            <Monitor className="w-3 h-3" aria-hidden="true" />
            {machinesLabel}
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
        {sortedEnvironments.length > 0 ? (
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Environment: ${envLabel}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
            >
              <Globe className="w-3 h-3" aria-hidden="true" />
              {envLabel}
              <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
            </Button>
            <Dropdown.Popover placement="top" className="min-w-[220px] max-w-[320px]">
              <ScrollShadow className="max-h-[300px]">
                <Dropdown.Menu
                  selectionMode="single"
                  selectedKeys={envKeys}
                  onSelectionChange={(keys) => {
                    const selected = [...keys][0];
                    if (typeof selected === 'string' && onEnvironmentSelect) {
                      onEnvironmentSelect(selected);
                    }
                  }}
                >
                  {sortedEnvironments.map((env) => (
                    <Dropdown.Item
                      key={env.path}
                      id={env.path}
                      textValue={`${env.name} (${env.branch})`}
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-3 h-3 shrink-0 text-muted" aria-hidden="true" />
                        <div className="min-w-0">
                          <Label className="truncate block">{env.name}</Label>
                          <span className="text-xs text-muted truncate block">{env.branch}</span>
                        </div>
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </ScrollShadow>
            </Dropdown.Popover>
          </Dropdown>
        ) : (
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" aria-hidden="true" />
            No environment
          </span>
        )}

        {/* Branch */}
        <span className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" aria-hidden="true" />
          {branchLabel}
        </span>
      </div>
    </div>
  );
}
