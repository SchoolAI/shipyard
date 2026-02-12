import { Button, Popover } from '@heroui/react';
import { Paperclip, Plus } from 'lucide-react';

export function AttachmentPopover() {
  return (
    <Popover>
      <Popover.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Add attachment"
          className="rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 w-7 h-7 min-w-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="top start" className="w-48 p-0">
        <Popover.Dialog>
          <div className="py-0.5">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
              Add photos & files
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
