import { Button, Popover } from '@heroui/react';
import { Paperclip, Plus } from 'lucide-react';
import { useRef } from 'react';
import { SUPPORTED_IMAGE_TYPES } from '../../utils/image-utils';

interface AttachmentPopoverProps {
  onFilesSelected: (files: File[]) => void;
}

export function AttachmentPopover({ onFilesSelected }: AttachmentPopoverProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Popover>
      <Popover.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Add attachment"
          className="rounded-full text-muted hover:text-foreground hover:bg-default w-11 h-11 sm:w-8 sm:h-8 min-w-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Content placement="top start" className="w-auto min-w-0 p-0">
        <Popover.Dialog>
          <div className="py-px">
            <button
              type="button"
              className="flex items-center gap-1.5 w-full px-2 py-1 text-xs text-foreground/80 hover:bg-default rounded-sm transition-colors whitespace-nowrap"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-3 h-3 text-muted" aria-hidden="true" />
              Add photos & files
            </button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_IMAGE_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFilesSelected(files);
          e.target.value = '';
        }}
      />
    </Popover>
  );
}
