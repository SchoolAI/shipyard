import { Button, Dropdown, Label } from '@heroui/react';
import { ChevronDown } from 'lucide-react';
import { useMemo } from 'react';

export type ReasoningLevel = 'low' | 'medium' | 'high';

const LEVELS: { id: ReasoningLevel; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

interface ReasoningEffortProps {
  level: ReasoningLevel;
  onLevelChange: (level: ReasoningLevel) => void;
}

export function ReasoningEffort({ level, onLevelChange }: ReasoningEffortProps) {
  const selectedKeys = useMemo(() => new Set([level]), [level]);
  const currentLabel = LEVELS.find((l) => l.id === level)?.label ?? 'Medium';

  return (
    <Dropdown>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Reasoning effort: ${currentLabel}`}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted hover:text-foreground hover:bg-default transition-colors"
      >
        {currentLabel}
        <ChevronDown className="w-3 h-3" />
      </Button>
      <Dropdown.Popover placement="top start" className="min-w-[140px]">
        <Dropdown.Menu
          selectionMode="single"
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => {
            const selected = [...keys][0];
            if (selected === 'low' || selected === 'medium' || selected === 'high') {
              onLevelChange(selected);
            }
          }}
        >
          {LEVELS.map((l) => (
            <Dropdown.Item key={l.id} id={l.id} textValue={l.label}>
              <Label>{l.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
