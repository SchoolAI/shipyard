import { Kbd, ListBox } from '@heroui/react';
import { useEffect, useRef } from 'react';
import type { SlashCommand } from '../../hooks/use-slash-commands';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

const COMMAND_SHORTCUTS: Record<string, { keys: Array<'command' | 'shift'>; label: string }> = {
  clear: { keys: ['command', 'shift'], label: 'K' },
};

export function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (commands.length === 0) return null;

  const selectedCommand = commands[selectedIndex];
  const selectedKeys = selectedCommand ? new Set([selectedCommand.id]) : new Set<string>();

  return (
    <div ref={menuRef} className="absolute bottom-full left-0 right-0 mb-2 z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-64">
        <div className="px-3 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-500">Commands</span>
        </div>
        <ListBox
          aria-label="Slash commands"
          selectionMode="single"
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const selectedId = [...keys][0];
            const command = commands.find((c) => c.id === selectedId);
            if (command) {
              onSelect(command);
            }
          }}
          className="p-1"
        >
          {commands.map((command, index) => {
            const Icon = command.icon;
            const shortcut = COMMAND_SHORTCUTS[command.id];
            const isSelected = index === selectedIndex;

            return (
              <ListBox.Item
                key={command.id}
                id={command.id}
                textValue={command.name}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-zinc-200">{command.name}</span>
                    <span className="text-xs text-zinc-500 truncate">{command.description}</span>
                  </div>
                </div>
                {shortcut && (
                  <Kbd className="shrink-0 ml-auto">
                    {shortcut.keys.map((key) => (
                      <Kbd.Abbr key={key} keyValue={key} />
                    ))}
                    <Kbd.Content>{shortcut.label}</Kbd.Content>
                  </Kbd>
                )}
              </ListBox.Item>
            );
          })}
        </ListBox>
      </div>
    </div>
  );
}
