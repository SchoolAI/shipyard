import { Button, Kbd, Tooltip } from '@heroui/react';
import { type A2ATaskState, LOCAL_USER_ID, type TaskIndexEntry } from '@shipyard/loro-schema';
import { Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HOTKEYS } from '../constants/hotkeys';
import { useTaskIndex } from '../hooks/use-task-index';
import { useTaskStore, useUIStore } from '../stores';
import { statusDotColor } from '../utils/task-status';
import { ThemeToggle } from './theme-toggle';

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function statusLabel(status: A2ATaskState): string {
  return status;
}

function TaskItem({
  task,
  isActive,
  isExpanded,
  onSelect,
}: {
  task: TaskIndexEntry;
  isActive: boolean;
  isExpanded: boolean;
  onSelect: () => void;
}) {
  const dotClass = statusDotColor(task.status);
  const dotTitle = statusLabel(task.status);

  if (!isExpanded) {
    return (
      <Tooltip>
        <Tooltip.Trigger>
          <button
            type="button"
            role="option"
            aria-selected={isActive}
            aria-label={`${task.title}, ${task.status}`}
            className={`flex items-center justify-center w-full h-9 rounded-lg transition-colors ${
              isActive ? 'bg-default/60' : 'hover:bg-default/30'
            }`}
            onClick={onSelect}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
              aria-hidden="true"
              title={dotTitle}
            />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="right">
          <span className="text-sm">{task.title}</span>
        </Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      aria-label={`${task.title}, ${task.status}`}
      className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-default/60 text-foreground'
          : 'text-muted hover:text-foreground hover:bg-default/30'
      }`}
      onClick={onSelect}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
        aria-hidden="true"
        title={dotTitle}
      />
      <span className="text-sm truncate flex-1 min-w-0">{task.title}</span>
      <span className="text-xs text-muted/60 shrink-0">{relativeTime(task.updatedAt)}</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-8">
      <p className="text-sm text-muted">No tasks yet</p>
      <p className="text-xs text-muted/60">Create a task above to get started</p>
    </div>
  );
}

export function Sidebar() {
  const { taskIndex } = useTaskIndex(LOCAL_USER_ID);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const isExpanded = useUIStore((s) => s.isSidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarExpanded = useUIStore((s) => s.setSidebarExpanded);

  const tasks = useMemo(
    () => Object.values(taskIndex).sort((a, b) => b.updatedAt - a.updatedAt),
    [taskIndex]
  );

  const handleNewTask = useCallback(() => {
    setActiveTask(null);
  }, [setActiveTask]);

  const handleTaskSelect = useCallback(
    (taskId: string) => {
      setActiveTask(taskId);
      if (window.innerWidth < 768) {
        setSidebarExpanded(false);
      }
    },
    [setActiveTask, setSidebarExpanded]
  );

  return (
    <>
      {isExpanded && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onPointerDown={() => setSidebarExpanded(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSidebarExpanded(false);
          }}
          aria-hidden="true"
        />
      )}
      <nav
        aria-label="Task navigation"
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-separator bg-background shrink-0 w-[260px] motion-safe:transition-transform motion-safe:duration-300 ease-in-out overflow-hidden md:relative md:z-auto md:motion-safe:transition-[width] md:translate-x-0 ${
          isExpanded ? 'translate-x-0' : '-translate-x-full'
        } ${isExpanded ? 'md:w-[260px]' : 'md:w-12'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-2 shrink-0">
          {isExpanded ? (
            <>
              <img src="/icon.svg" alt="" className="w-5 h-5 shrink-0 ml-1 opacity-60" />
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="Collapse sidebar"
                    aria-expanded={isExpanded}
                    aria-controls="sidebar-content"
                    className="text-muted hover:text-foreground hover:bg-default/50 w-8 h-8 min-w-0"
                    onPress={toggleSidebar}
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span className="flex items-center gap-2">
                    Collapse sidebar
                    <Kbd>{HOTKEYS.toggleSidebar.display}</Kbd>
                  </span>
                </Tooltip.Content>
              </Tooltip>
            </>
          ) : (
            <div className="flex flex-col items-center w-full gap-1">
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="Expand sidebar"
                    aria-expanded={isExpanded}
                    aria-controls="sidebar-content"
                    className="text-muted hover:text-foreground hover:bg-default/50 w-8 h-8 min-w-0"
                    onPress={toggleSidebar}
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="right">
                  <span className="flex items-center gap-2">
                    Expand sidebar
                    <Kbd>{HOTKEYS.toggleSidebar.display}</Kbd>
                  </span>
                </Tooltip.Content>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Content area */}
        <div id="sidebar-content" className="flex flex-col flex-1 min-h-0">
          {/* New task row -- ghost style, matches other sidebar rows */}
          {isExpanded ? (
            <div className="px-1.5 mb-1">
              <Tooltip>
                <Tooltip.Trigger>
                  <button
                    type="button"
                    className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-muted hover:text-foreground hover:bg-default/30 transition-colors"
                    onClick={handleNewTask}
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    New task
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span className="flex items-center gap-2">
                    New task
                    <Kbd>{HOTKEYS.newTask.display}</Kbd>
                  </span>
                </Tooltip.Content>
              </Tooltip>
            </div>
          ) : (
            <div className="flex justify-center mb-1">
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="New task"
                    className="text-muted hover:text-foreground hover:bg-default/50 w-8 h-8 min-w-0"
                    onPress={handleNewTask}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="right">
                  <span className="flex items-center gap-2">
                    New task
                    <Kbd>{HOTKEYS.newTask.display}</Kbd>
                  </span>
                </Tooltip.Content>
              </Tooltip>
            </div>
          )}

          {/* Section label */}
          {isExpanded && (
            <div className="px-3 mb-1 mt-1">
              <span className="text-xs font-medium text-muted/60">Tasks</span>
            </div>
          )}

          {/* Task list */}
          <div
            role="listbox"
            aria-label="Tasks"
            className="flex-1 overflow-y-auto px-1.5 space-y-px"
          >
            {tasks.length === 0 && isExpanded ? (
              <EmptyState />
            ) : (
              tasks.map((task) => (
                <TaskItem
                  key={task.taskId}
                  task={task}
                  isActive={task.taskId === activeTaskId}
                  isExpanded={isExpanded}
                  onSelect={() => handleTaskSelect(task.taskId)}
                />
              ))
            )}
          </div>

          {/* Settings + Theme toggle -- pinned to bottom */}
          <div className="mt-auto shrink-0 p-2">
            {isExpanded ? (
              <div className="flex items-center gap-1">
                <Tooltip>
                  <Tooltip.Trigger>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 justify-start text-muted hover:text-foreground gap-2"
                      onPress={() => useUIStore.getState().setSettingsOpen(true)}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <span className="flex items-center gap-2">
                      Settings
                      <Kbd>{HOTKEYS.settings.display}</Kbd>
                    </span>
                  </Tooltip.Content>
                </Tooltip>
                <ThemeToggle />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Tooltip>
                  <Tooltip.Trigger>
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      aria-label="Settings"
                      className="text-muted hover:text-foreground hover:bg-default/50 w-8 h-8 min-w-0"
                      onPress={() => useUIStore.getState().setSettingsOpen(true)}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content placement="right">
                    <span className="flex items-center gap-2">
                      Settings
                      <Kbd>{HOTKEYS.settings.display}</Kbd>
                    </span>
                  </Tooltip.Content>
                </Tooltip>
                <ThemeToggle />
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

export function MobileSidebarToggle() {
  const isExpanded = useUIStore((s) => s.isSidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label={isExpanded ? 'Close sidebar' : 'Open sidebar'}
      aria-expanded={isExpanded}
      className="md:hidden text-muted hover:text-foreground hover:bg-default w-11 h-11 sm:w-8 sm:h-8 min-w-0"
      onPress={toggleSidebar}
    >
      <Menu className="w-4 h-4" />
    </Button>
  );
}
