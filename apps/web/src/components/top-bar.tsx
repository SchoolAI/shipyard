import { Button, Kbd, Tooltip } from '@heroui/react';
import type { TodoItem } from '@shipyard/loro-schema';
import { LOCAL_USER_ID } from '@shipyard/loro-schema';
import { PanelRight, Terminal } from 'lucide-react';
import { useMemo } from 'react';
import { HOTKEYS } from '../constants/hotkeys';
import { useTaskIndex } from '../hooks/use-task-index';
import { useTaskStore, useUIStore } from '../stores';
import { formatCostUsd } from '../utils/format-cost';
import { ProgressRing } from './progress-ring';
import { MobileSidebarToggle } from './sidebar';

interface TopBarProps {
  onToggleTerminal: () => void;
  onToggleSidePanel: () => void;
  hasUnviewedDiff?: boolean;
  totalCostUsd?: number | null;
  todoItems?: TodoItem[];
}

export function TopBar({
  onToggleTerminal,
  onToggleSidePanel,
  hasUnviewedDiff,
  totalCostUsd,
  todoItems = [],
}: TopBarProps) {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const { taskIndex } = useTaskIndex(LOCAL_USER_ID);
  const activeEntry = activeTaskId ? taskIndex[activeTaskId] : undefined;
  const formattedCost = formatCostUsd(totalCostUsd);
  const completedCount = useMemo(
    () => todoItems.filter((t) => t.status === 'completed').length,
    [todoItems]
  );

  return (
    <header className="flex items-center justify-between px-4 py-1.5 border-b border-separator/50 h-10">
      <div className="flex items-center gap-2 min-w-0">
        <MobileSidebarToggle />
        {activeEntry ? (
          <h1 className="text-sm text-foreground font-medium truncate">{activeEntry.title}</h1>
        ) : (
          <span className="text-sm text-muted truncate">Shipyard</span>
        )}
        {formattedCost && (
          <span
            role="status"
            aria-label={`Task cost: ${formattedCost}`}
            className="hidden sm:inline text-xs text-muted font-mono shrink-0"
          >
            <span aria-hidden="true">&middot;</span> {formattedCost}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {todoItems.length > 0 && (
          <button
            type="button"
            onClick={() => useUIStore.getState().setActiveSidePanel('tasks')}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted hover:text-foreground transition-colors px-1.5"
            aria-label={`Task progress: ${completedCount} of ${todoItems.length}`}
          >
            <ProgressRing completed={completedCount} total={todoItems.length} size={16} />
            <span>
              {completedCount}/{todoItems.length}
            </span>
          </button>
        )}
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Toggle terminal"
              onPress={onToggleTerminal}
              className="hidden sm:inline-flex text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0"
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
            <span className="relative inline-flex">
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="Toggle side panel"
                onPress={onToggleSidePanel}
                className="text-muted hover:text-foreground hover:bg-default w-9 h-9 sm:w-8 sm:h-8 min-w-0"
              >
                <PanelRight className="w-4 h-4" />
              </Button>
              {hasUnviewedDiff && (
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-accent" />
              )}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <span className="flex items-center gap-2">
              Toggle side panel
              <Kbd>{HOTKEYS.toggleDiff.display}</Kbd>
            </span>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  );
}
