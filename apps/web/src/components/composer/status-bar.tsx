import { Dropdown, Label } from '@heroui/react';
import { ChevronDown, GitBranch, Globe, Monitor, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';

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

export function StatusBar() {
  const [permission, setPermission] = useState<PermissionLevel>('default');
  const [environment, setEnvironment] = useState<EnvironmentOption>('none');

  const permissionKeys = useMemo(() => new Set([permission]), [permission]);
  const envKeys = useMemo(() => new Set([environment]), [environment]);

  const permissionLabel =
    PERMISSIONS.find((p) => p.id === permission)?.label ?? 'Default permissions';
  const envLabel = ENVIRONMENTS.find((e) => e.id === environment)?.label ?? 'No environment';

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-3">
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        {/* Local (static placeholder) */}
        <button
          type="button"
          aria-label="Select environment location"
          className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <Monitor className="w-3 h-3" />
          Local
          <ChevronDown className="w-2.5 h-2.5" />
        </button>

        {/* Permissions */}
        <Dropdown>
          <button
            type="button"
            aria-label={`Permissions: ${permissionLabel}`}
            className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer text-xs text-zinc-500"
          >
            <Shield className="w-3 h-3" />
            {permissionLabel}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          <Dropdown.Popover placement="top" className="min-w-[180px]">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={permissionKeys}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (typeof selected === 'string') {
                  setPermission(selected as PermissionLevel);
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
          <button
            type="button"
            aria-label={`Environment: ${envLabel}`}
            className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer text-xs text-zinc-500"
          >
            <Globe className="w-3 h-3" />
            {envLabel}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          <Dropdown.Popover placement="top" className="min-w-[160px]">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={envKeys}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (typeof selected === 'string') {
                  setEnvironment(selected as EnvironmentOption);
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
          className="flex items-center gap-1 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <GitBranch className="w-3 h-3" />
          From main
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}
