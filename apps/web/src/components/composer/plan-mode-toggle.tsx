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
          aria-label={isActive ? 'Disable plan mode' : 'Enable plan mode'}
          aria-pressed={isActive}
          onPress={onToggle}
          className={`rounded-lg w-7 h-7 min-w-0 transition-colors ${
            isActive
              ? 'bg-hull text-foreground'
              : 'text-muted hover:text-foreground hover:bg-default'
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Plan mode</Tooltip.Content>
    </Tooltip>
  );
}
