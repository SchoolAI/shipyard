import { Chip, CloseButton } from '@heroui/react';
import { colorFromString } from '@/utils/color';

interface TagChipProps {
  tag: string;
  removable?: boolean;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function TagChip({ tag, removable = false, onRemove, size = 'sm' }: TagChipProps) {
  const color = colorFromString(tag);

  return (
    <Chip
      size={size}
      variant="soft"
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderColor: color,
      }}
      className="inline-flex items-center gap-1"
    >
      <span>{tag}</span>
      {removable && onRemove && (
        <CloseButton
          onPress={onRemove}
          aria-label={`Remove ${tag} tag`}
          className="w-3 h-3 min-w-0 ml-1"
        />
      )}
    </Chip>
  );
}
