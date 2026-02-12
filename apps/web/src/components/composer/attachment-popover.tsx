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
      <Popover.Content placement="top start" className="w-56">
        <Popover.Dialog>
          <div className="py-1">
            <button
              type="button"
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <Paperclip className="w-4 h-4 text-zinc-400" />
              Add photos & files
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
