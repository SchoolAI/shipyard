import { Button, Tooltip } from '@heroui/react';
import { Diff, Plus, Terminal } from 'lucide-react';

export function TopBar() {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50">
      <Button
        variant="ghost"
        size="sm"
        className="text-zinc-300 hover:text-zinc-100 gap-1.5"
        onPress={() => {}}
      >
        <Plus className="w-4 h-4" />
        New task
      </Button>

      <div className="flex items-center gap-1">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Toggle diff panel"
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 w-8 h-8 min-w-0"
            >
              <Diff className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <span className="flex items-center gap-2">
              Toggle diff panel
              <kbd className="text-[10px] text-zinc-400 bg-zinc-700 px-1.5 py-0.5 rounded">
                Cmd+Shift+B
              </kbd>
            </span>
          </Tooltip.Content>
        </Tooltip>
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Toggle terminal"
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 w-8 h-8 min-w-0"
            >
              <Terminal className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <span className="flex items-center gap-2">
              Toggle terminal
              <kbd className="text-[10px] text-zinc-400 bg-zinc-700 px-1.5 py-0.5 rounded">
                Cmd+J
              </kbd>
            </span>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
