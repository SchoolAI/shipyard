import { Button, Kbd, Tooltip } from '@heroui/react';
import { Diff, Plus, Terminal } from 'lucide-react';

interface TopBarProps {
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
}

export function TopBar({ onToggleTerminal, onToggleDiff }: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-separator/50">
      <Button
        variant="ghost"
        size="sm"
        className="text-foreground/80 hover:text-foreground gap-1.5"
        onPress={() => {
          /** TODO: open new task dialog */
        }}
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">New task</span>
      </Button>

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
              <Kbd>
                <Kbd.Abbr keyValue="ctrl" />
                <Kbd.Content>`</Kbd.Content>
              </Kbd>
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
              <Kbd>
                <Kbd.Abbr keyValue="command" />
                <Kbd.Abbr keyValue="shift" />
                <Kbd.Content>G</Kbd.Content>
              </Kbd>
            </span>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
