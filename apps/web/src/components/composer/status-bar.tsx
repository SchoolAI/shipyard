import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { ChevronDown, GitBranch, Globe, Monitor, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AgentInfo, ConnectionState } from '../../hooks/use-personal-room';

type PermissionLevel = 'default' | 'accept-edits' | 'bypass';

const PERMISSIONS: { id: PermissionLevel; label: string }[] = [
  { id: 'default', label: 'Default permissions' },
  { id: 'accept-edits', label: 'Accept edits' },
  { id: 'bypass', label: 'Bypass permissions' },
];

type EnvironmentOption = 'none' | 'nodejs' | 'python';

const ENVIRONMENTS: { id: EnvironmentOption; label: string }[] = [
  { id: 'none', label: 'No environment' },
  { id: 'nodejs', label: 'Node.js' },
  { id: 'python', label: 'Python' },
];

const STATUS_COLOR: Record<AgentInfo['status'], 'success' | 'warning' | 'danger'> = {
  idle: 'success',
  running: 'warning',
  error: 'danger',
};

interface MachineGroup {
  machineId: string;
  machineName: string;
  agents: AgentInfo[];
}

function groupByMachine(agents: AgentInfo[]): MachineGroup[] {
  const map = new Map<string, MachineGroup>();
  for (const agent of agents) {
    let group = map.get(agent.machineId);
    if (!group) {
      group = { machineId: agent.machineId, machineName: agent.machineName, agents: [] };
      map.set(agent.machineId, group);
    }
    group.agents.push(agent);
  }
  return [...map.values()];
}

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
  agents?: AgentInfo[];
  connectionState?: ConnectionState;
}

export function StatusBar({ agents = [], connectionState = 'disconnected' }: StatusBarProps) {
  const [permission, setPermission] = useState<PermissionLevel>('default');
  const [environment, setEnvironment] = useState<EnvironmentOption>('none');

  const permissionKeys = useMemo(() => new Set([permission]), [permission]);
  const envKeys = useMemo(() => new Set([environment]), [environment]);
  const machines = useMemo(() => groupByMachine(agents), [agents]);

  const permissionLabel =
    PERMISSIONS.find((p) => p.id === permission)?.label ?? 'Default permissions';
  const envLabel = ENVIRONMENTS.find((e) => e.id === environment)?.label ?? 'No environment';
  const machinesLabel = machineLabel(machines, connectionState);

  return (
    <div className="w-full max-w-3xl mx-auto pb-3">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {machines.length > 0 ? (
          <Dropdown>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Machines: ${machinesLabel}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
            >
              <Monitor className="w-3 h-3" />
              {machinesLabel}
              <ChevronDown className="w-2.5 h-2.5" />
            </Button>
            <Dropdown.Popover placement="top" className="min-w-[200px]">
              <Dropdown.Menu selectionMode="none">
                {machines.flatMap((machine) =>
                  machine.agents.map((agent) => (
                    <Dropdown.Item
                      key={agent.agentId}
                      id={agent.agentId}
                      textValue={`${machine.machineName} - ${agent.agentType}`}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <Label>{machine.machineName}</Label>
                        <Chip size="sm" variant="soft" color={STATUS_COLOR[agent.status]}>
                          {agent.status}
                        </Chip>
                      </div>
                    </Dropdown.Item>
                  ))
                )}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        ) : (
          <span className="flex items-center gap-1">
            <Monitor className="w-3 h-3" />
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
            <Shield className="w-3 h-3" />
            {permissionLabel}
            <ChevronDown className="w-2.5 h-2.5" />
          </Button>
          <Dropdown.Popover placement="top" className="min-w-[180px]">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={permissionKeys}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (
                  selected === 'default' ||
                  selected === 'accept-edits' ||
                  selected === 'bypass'
                ) {
                  setPermission(selected);
                }
              }}
            >
              {PERMISSIONS.map((perm) => (
                <Dropdown.Item key={perm.id} id={perm.id} textValue={perm.label}>
                  <Label>{perm.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        {/* Environment */}
        <Dropdown>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Environment: ${envLabel}`}
            className="flex items-center gap-1 hover:text-foreground transition-colors text-xs text-muted"
          >
            <Globe className="w-3 h-3" />
            {envLabel}
            <ChevronDown className="w-2.5 h-2.5" />
          </Button>
          <Dropdown.Popover placement="top" className="min-w-[160px]">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={envKeys}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (selected === 'none' || selected === 'nodejs' || selected === 'python') {
                  setEnvironment(selected);
                }
              }}
            >
              {ENVIRONMENTS.map((env) => (
                <Dropdown.Item key={env.id} id={env.id} textValue={env.label}>
                  <Label>{env.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        {/* Branch */}
        <button
          type="button"
          aria-label="Select git branch"
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
        >
          <GitBranch className="w-3 h-3" />
          From main
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}
