import { Button, Dropdown, Label } from '@heroui/react';
import type { PermissionMode } from '@shipyard/loro-schema';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, FileCheck, ListChecks, Shield, ShieldOff } from 'lucide-react';
import { useMemo } from 'react';

interface ModeOption {
  id: PermissionMode;
  label: string;
  description: string;
  icon: LucideIcon;
}

const MODE_IDS: ReadonlySet<PermissionMode> = new Set<PermissionMode>([
  'default',
  'accept-edits',
  'plan',
  'bypass',
]);

function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && MODE_IDS.has(value as never);
}

const DEFAULT_MODE: ModeOption = {
  id: 'default',
  label: 'Default',
  description: 'Prompts for dangerous operations',
  icon: Shield,
};

const MODES: ModeOption[] = [
  DEFAULT_MODE,
  {
    id: 'accept-edits',
    label: 'Accept Edits',
    description: 'Auto-accept file edits',
    icon: FileCheck,
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'No tool execution, planning only',
    icon: ListChecks,
  },
  {
    id: 'bypass',
    label: 'Bypass',
    description: 'Skip all permission checks',
    icon: ShieldOff,
  },
];

export interface PermissionModePickerProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
}

export function PermissionModePicker({ mode, onModeChange }: PermissionModePickerProps) {
  const selectedKeys = useMemo(() => new Set([mode]), [mode]);
  const current = MODES.find((m) => m.id === mode) ?? DEFAULT_MODE;
  const Icon = current.icon;
  const isBypass = mode === 'bypass';

  return (
    <Dropdown>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Permission mode: ${current.label}`}
        className={`flex items-center gap-1 min-w-11 sm:min-w-0 px-1.5 sm:px-2 py-1 rounded-lg text-xs min-h-[44px] sm:min-h-0 ${
          isBypass ? 'text-warning' : 'text-muted'
        } hover:text-foreground hover:bg-default transition-colors`}
      >
        <Icon className="w-3.5 h-3.5 sm:w-3 sm:h-3" aria-hidden="true" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="w-3 h-3 hidden sm:block" aria-hidden="true" />
      </Button>
      <Dropdown.Popover placement="top start" className="min-w-[240px]">
        <Dropdown.Menu
          selectionMode="single"
          selectedKeys={selectedKeys}
          aria-label="Permission mode"
          onSelectionChange={(keys) => {
            const selected = [...keys][0];
            if (isPermissionMode(selected)) {
              onModeChange(selected);
            }
          }}
        >
          {MODES.map((m) => {
            const ModeIcon = m.icon;
            return (
              <Dropdown.Item key={m.id} id={m.id} textValue={m.label}>
                <div className="flex items-start gap-2">
                  <ModeIcon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${m.id === 'bypass' ? 'text-warning' : 'text-muted'}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <Label>{m.label}</Label>
                    <span className="text-xs text-muted">{m.description}</span>
                  </div>
                </div>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
