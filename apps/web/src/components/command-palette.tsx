import { Kbd } from '@heroui/react';
import { Command } from 'cmdk';
import {
  GitCompareArrows,
  Keyboard,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Terminal,
} from 'lucide-react';
import { useCallback } from 'react';
import { HOTKEYS } from '../constants/hotkeys';
import { useTaskStore, useUIStore } from '../stores';
import { statusDotColor } from '../utils/task-status';

const ITEM_CLASS =
  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal text-foreground/80 data-[selected=true]:bg-default/40 data-[selected=true]:text-foreground transition-colors';

const GROUP_HEADING_CLASS =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted/60';

export function CommandPalette() {
  const isOpen = useUIStore((s) => s.isCommandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const tasks = useTaskStore((s) => s.tasks);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleSelectTask = useCallback(
    (taskId: string) => {
      setActiveTask(taskId);
      close();
    },
    [setActiveTask, close]
  );

  const handleNewTask = useCallback(() => {
    useTaskStore.getState().createAndActivateTask('New task');
    close();
  }, [close]);

  const handleToggleTerminal = useCallback(() => {
    useUIStore.getState().toggleTerminal();
    close();
  }, [close]);

  const handleToggleDiff = useCallback(() => {
    useUIStore.getState().toggleDiff();
    close();
  }, [close]);

  const handleToggleSidebar = useCallback(() => {
    useUIStore.getState().toggleSidebar();
    close();
  }, [close]);

  const handleOpenSettings = useCallback(() => {
    useUIStore.getState().setSettingsOpen(true);
    close();
  }, [close]);

  const handleShowShortcuts = useCallback(() => {
    useUIStore.getState().setShortcutsModalOpen(true);
    close();
  }, [close]);

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={setOpen}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 bg-black/60"
      contentClassName="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg"
    >
      <div className="bg-surface border border-separator rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-separator">
          <Search className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />
          <Command.Input
            placeholder="Search tasks, actions..."
            autoFocus
            className="w-full bg-transparent text-foreground placeholder-muted/60 text-sm py-3.5 outline-none"
          />
        </div>

        <Command.List className="max-h-80 overflow-y-auto p-1.5">
          <Command.Empty className="py-6 text-center text-sm text-muted">
            No results found.
          </Command.Empty>

          <Command.Group heading="Tasks" className={GROUP_HEADING_CLASS}>
            {tasks.map((task) => (
              <Command.Item
                key={task.id}
                value={task.title}
                keywords={[task.status]}
                onSelect={() => handleSelectTask(task.id)}
                className={ITEM_CLASS}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColor(task.agent)}`}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate min-w-0">{task.title}</span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Separator className="h-px bg-separator mx-2 my-1" />

          <Command.Group heading="Actions" className={GROUP_HEADING_CLASS}>
            <Command.Item value="New Task" onSelect={handleNewTask} className={ITEM_CLASS}>
              <Plus className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <span className="flex-1">New Task</span>
              <Kbd>{HOTKEYS.newTask.display}</Kbd>
            </Command.Item>

            <Command.Item
              value="Toggle Terminal"
              onSelect={handleToggleTerminal}
              className={ITEM_CLASS}
            >
              <Terminal className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <span className="flex-1">Toggle Terminal</span>
              <Kbd>{HOTKEYS.toggleTerminal.display}</Kbd>
            </Command.Item>

            <Command.Item
              value="Toggle Diff Panel"
              onSelect={handleToggleDiff}
              className={ITEM_CLASS}
            >
              <GitCompareArrows className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <span className="flex-1">Toggle Diff Panel</span>
              <Kbd>{HOTKEYS.toggleDiff.display}</Kbd>
            </Command.Item>

            <Command.Item
              value="Toggle Sidebar"
              onSelect={handleToggleSidebar}
              className={ITEM_CLASS}
            >
              <PanelLeftClose className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <span className="flex-1">Toggle Sidebar</span>
              <Kbd>{HOTKEYS.toggleSidebar.display}</Kbd>
            </Command.Item>

            <Command.Item value="Settings" onSelect={handleOpenSettings} className={ITEM_CLASS}>
              <Settings className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <span className="flex-1">Settings</span>
              <Kbd>{HOTKEYS.settings.display}</Kbd>
            </Command.Item>

            <Command.Item
              value="Keyboard Shortcuts"
              onSelect={handleShowShortcuts}
              className={ITEM_CLASS}
            >
              <Keyboard className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
              <span className="flex-1">Keyboard Shortcuts</span>
              <Kbd>{HOTKEYS.showShortcutsAlt.display}</Kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
