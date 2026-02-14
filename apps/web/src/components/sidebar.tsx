import { Button, Kbd, Tooltip } from '@heroui/react';
import { Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings } from 'lucide-react';
import { useCallback } from 'react';
import { HOTKEYS } from '../constants/hotkeys';
import { useMessageStore, useTaskStore, useUIStore } from '../stores';
import type { AgentState, TaskData } from '../stores/types';

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

function assertNever(value: never): never {
  throw new Error(`Unexpected agent state: ${String(value)}`);
}

function statusDotColor(agent: TaskData['agent']): string {
  if (!agent) return 'bg-muted/40';
  switch (agent.state) {
    case 'running':
      return 'bg-warning motion-safe:animate-pulse';
    case 'idle':
      return 'bg-success';
    case 'error':
      return 'bg-danger';
    default:
      return assertNever(agent.state);
  }
}

function agentStateLabel(state: AgentState): string {
  switch (state) {
    case 'running':
      return 'running';
    case 'idle':
      return 'idle';
    case 'error':
      return 'error';
    default:
      return assertNever(state);
  }
}

function TaskItem({
  task,
  isActive,
  isExpanded,
  onSelect,
}: {
  task: TaskData;
  isActive: boolean;
  isExpanded: boolean;
  onSelect: () => void;
}) {
  const dotClass = statusDotColor(task.agent);
  const stateLabel = task.agent ? `, ${agentStateLabel(task.agent.state)}` : '';

  if (!isExpanded) {
    return (
      <Tooltip>
        <Tooltip.Trigger>
          <button
            type="button"
            role="option"
            aria-selected={isActive}
            aria-label={`${task.title}${stateLabel}`}
            className={`flex items-center justify-center w-full h-9 rounded-lg transition-colors ${
              isActive ? 'bg-default/60' : 'hover:bg-default/30'
            }`}
            onClick={onSelect}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
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
      aria-label={`${task.title}${stateLabel}`}
      className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-default/60 text-foreground'
          : 'text-muted hover:text-foreground hover:bg-default/30'
      }`}
      onClick={onSelect}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
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
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const createTask = useTaskStore((s) => s.createTask);
  const isExpanded = useUIStore((s) => s.isSidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const handleNewTask = useCallback(() => {
    const id = createTask('New task');
    setActiveTask(id);
    useMessageStore.getState().clearMessages(id);
  }, [createTask, setActiveTask]);

  return (
    <nav
      aria-label="Task navigation"
      className={`hidden md:flex flex-col border-r border-separator bg-background shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden ${
        isExpanded ? 'w-[260px]' : 'w-12'
      }`}
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
                  <Plus className="w-4 h-4" />
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
        <div role="listbox" aria-label="Tasks" className="flex-1 overflow-y-auto px-1.5 space-y-px">
          {tasks.length === 0 && isExpanded ? (
            <EmptyState />
          ) : (
            tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isActive={task.id === activeTaskId}
                isExpanded={isExpanded}
                onSelect={() => setActiveTask(task.id)}
              />
            ))
          )}
        </div>

        {/* Settings -- pinned to bottom, separated by whitespace only */}
        <div className="mt-auto shrink-0 p-2">
          {isExpanded ? (
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted hover:text-foreground gap-2"
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
          ) : (
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
          )}
        </div>
      </div>
    </nav>
  );
}

export function MobileSidebarToggle() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label="Toggle sidebar"
      className="md:hidden text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0"
      onPress={toggleSidebar}
    >
      <Menu className="w-4 h-4" />
    </Button>
  );
}
