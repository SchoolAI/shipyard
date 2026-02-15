import { Kbd } from '@heroui/react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useCommandRegistry } from '../../hooks/use-command-registry';
import { useUIStore } from '../../stores';
import type { CommandItem } from './types';

const ITEM_CLASS =
  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal text-foreground/80 data-[selected=true]:bg-default/40 data-[selected=true]:text-foreground transition-colors cursor-default';

const GROUP_HEADING_CLASS =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted/60';

function CommandPaletteItem({
  item,
  onSelect,
}: {
  item: CommandItem;
  onSelect: (id: string) => void;
}) {
  return (
    <Command.Item
      value={item.id}
      onSelect={() => {
        onSelect(item.id);
        item.onSelect();
      }}
      className={ITEM_CLASS}
    >
      {item.statusColor ? (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.statusColor}`}
          aria-hidden="true"
        />
      ) : item.icon ? (
        <item.icon className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
      ) : null}

      <span className="flex-1 truncate min-w-0">
        {item.label}
        {item.subtitle ? <span className="ml-2 text-xs text-muted/60">{item.subtitle}</span> : null}
      </span>

      {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
    </Command.Item>
  );
}

export function CommandPalette() {
  const isOpen = useUIStore((s) => s.isCommandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState('');
  const { getItems, recordSelection } = useCommandRegistry(isOpen);

  const groups = getItems(query);

  const handleSelect = useCallback(
    (itemId: string) => {
      recordSelection(itemId);
    },
    [recordSelection]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) {
        setQuery('');
      }
    },
    [setOpen]
  );

  return (
    <Command.Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      label="Command palette"
      loop
      shouldFilter={false}
      overlayClassName="fixed inset-0 bg-black/60"
      contentClassName="fixed top-[10%] sm:top-[20%] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-lg"
    >
      <div className="bg-surface border border-separator rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-separator">
          <Search className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />
          <Command.Input
            placeholder="Search tasks, actions..."
            autoFocus
            value={query}
            onValueChange={setQuery}
            className="w-full bg-transparent text-foreground placeholder-muted/60 text-sm py-3.5 outline-none"
          />
        </div>

        <Command.List className="max-h-80 overflow-y-auto p-1.5">
          <Command.Empty className="py-6 text-center text-sm text-muted">
            No results found.
          </Command.Empty>

          {groups.map((groupData, groupIndex) => (
            <div key={groupData.group}>
              {groupIndex > 0 ? (
                <Command.Separator className="h-px bg-separator mx-2 my-1" />
              ) : null}
              <Command.Group heading={groupData.group} className={GROUP_HEADING_CLASS}>
                {groupData.items.map((item) => (
                  <CommandPaletteItem key={item.id} item={item} onSelect={handleSelect} />
                ))}
              </Command.Group>
            </div>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
