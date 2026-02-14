import { Button, Kbd, Tooltip } from '@heroui/react';
import { Diff, Terminal } from 'lucide-react';
import { HOTKEYS } from '../constants/hotkeys';
import { useTaskStore } from '../stores';
import { MobileSidebarToggle } from './sidebar';

interface TopBarProps {
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
}

export function TopBar({ onToggleTerminal, onToggleDiff }: TopBarProps) {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const tasks = useTaskStore((s) => s.tasks);
  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : undefined;

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-separator/50 h-12">
      <div className="flex items-center gap-2 min-w-0">
        <MobileSidebarToggle />
        {activeTask ? (
          <h1 className="text-sm text-foreground font-medium truncate">{activeTask.title}</h1>
        ) : (
          <span className="text-sm text-muted truncate">Shipyard</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Toggle terminal"
              onPress={onToggleTerminal}
              className="text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0"
            >
              <Terminal className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <span className="flex items-center gap-2">
              Toggle terminal
              <Kbd>{HOTKEYS.toggleTerminal.display}</Kbd>
            </span>
          </Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Toggle diff panel"
              onPress={onToggleDiff}
              className="text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0"
            >
              <Diff className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <span className="flex items-center gap-2">
              Toggle diff panel
              <Kbd>{HOTKEYS.toggleDiff.display}</Kbd>
            </span>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  );
}
