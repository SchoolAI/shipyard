import { ListBox } from '@heroui/react';
import type { Key } from 'react';
import { useEffect, useRef } from 'react';
import type { SlashCommandItem } from '../../hooks/use-slash-commands';

interface SlashCommandMenuProps {
  commands: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (command: SlashCommandItem) => void;
  onClose: () => void;
  onHover: (index: number) => void;
}

export function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onClose,
  onHover,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (e.target instanceof Node && menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const el = menuRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (commands.length === 0) return null;

  const handleAction = (key: Key) => {
    const command = commands.find((c) => c.id === String(key));
    if (command) {
      onSelect(command);
    }
  };

  return (
    <div ref={menuRef} className="absolute bottom-full left-0 right-0 mb-2 z-50">
      <div className="bg-surface border border-hull rounded-xl shadow-2xl overflow-hidden max-h-64">
        <div className="px-3 py-2 border-b border-separator shrink-0">
          <span className="text-xs text-muted">Commands</span>
        </div>
        <div className="overflow-y-auto max-h-[calc(16rem-2.25rem)]">
          <ListBox
            aria-label="Slash commands"
            selectionMode="none"
            onAction={handleAction}
            className="p-1"
          >
            {commands.map((command, index) => {
              const Icon = command.icon;
              const isSelected = index === selectedIndex;

              return (
                <ListBox.Item
                  key={command.id}
                  id={command.id}
                  textValue={
                    command.parentLabel ? `${command.parentLabel} ${command.name}` : command.name
                  }
                  data-index={index}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-default' : 'hover:bg-default/50'
                  }`}
                  onHoverStart={() => {
                    if (index !== selectedIndex) {
                      onHover(index);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className="w-4 h-4 text-muted shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-foreground/90">
                        {command.parentLabel && (
                          <span className="text-muted text-xs">
                            {command.parentLabel}
                            <span className="mx-1">&rsaquo;</span>
                          </span>
                        )}
                        {command.name}
                      </span>
                      <span className="text-xs text-muted truncate">{command.description}</span>
                    </div>
                  </div>
                </ListBox.Item>
              );
            })}
          </ListBox>
        </div>
      </div>
    </div>
  );
}
