import { Button, Tooltip } from '@heroui/react';
import { ListChecks } from 'lucide-react';

interface PlanModeToggleProps {
  isActive: boolean;
  onToggle: () => void;
}

export function PlanModeToggle({ isActive, onToggle }: PlanModeToggleProps) {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Toggle plan mode"
          onPress={onToggle}
          className={`rounded-lg w-7 h-7 min-w-0 transition-colors ${
            isActive
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Plan mode</Tooltip.Content>
    </Tooltip>
  );
}
