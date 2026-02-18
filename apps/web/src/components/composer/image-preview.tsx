import { X } from 'lucide-react';
import type { ImageAttachment } from '../../utils/image-utils';

interface ImagePreviewProps {
  images: ImageAttachment[];
  onRemove: (index: number) => void;
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 px-4 pt-2 overflow-x-auto" role="list" aria-label="Attached images">
      {images.map((img, index) => (
        <div
          key={`${img.data.slice(0, 16)}-${index}`}
          role="listitem"
          className="relative shrink-0 group/thumb"
        >
          <img
            src={`data:${img.mediaType};base64,${img.data}`}
            alt={`Attachment ${index + 1}`}
            className="w-12 h-12 rounded-lg object-cover border border-separator"
          />
          <span
            className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-foreground/80 text-background text-[9px] font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <button
            type="button"
            aria-label={`Remove attachment ${index + 1}`}
            onClick={() => onRemove(index)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-default border border-separator flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/thumb:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3 text-muted" />
          </button>
        </div>
      ))}
    </div>
  );
}
