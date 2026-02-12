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
          className="rounded-full text-muted hover:text-foreground hover:bg-default w-7 h-7 min-w-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="top start" className="w-auto min-w-0 p-0">
        <Popover.Dialog>
          <div className="py-px">
            <button
              type="button"
              className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-foreground/80 hover:bg-default rounded-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Paperclip className="w-3 h-3 text-muted" />
              Add photos & files
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
