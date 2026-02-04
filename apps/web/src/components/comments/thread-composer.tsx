import { Avatar, Button, Card, TextArea } from '@heroui/react';
import { Send, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { colorFromString } from '@/utils/color';

interface ThreadComposerProps {
  onSubmit: (body: string) => void;
  onCancel: () => void;
  userId: string;
  selectedText?: string;
  autoFocus?: boolean;
}

function getInitials(userId: string): string {
  const name = userId.startsWith('local:') ? userId.slice(6) : userId;
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) {
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    const firstChar = first[0];
    const secondChar = second[0];
    if (firstChar && secondChar) {
      return (firstChar + secondChar).toUpperCase();
    }
  }
  return name.slice(0, 2).toUpperCase();
}

function formatUserId(userId: string): string {
  if (userId.startsWith('local:')) {
    return userId.slice(6);
  }
  return userId;
}

export function ThreadComposer({
  onSubmit,
  onCancel,
  userId,
  selectedText,
  autoFocus = true,
}: ThreadComposerProps) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayName = formatUserId(userId);
  const initials = getInitials(userId);
  const color = colorFromString(userId);

  const handleSubmit = useCallback(async () => {
    const trimmedValue = value.trim();
    if (!trimmedValue || isSubmitting) return;

    setIsSubmitting(true);
    try {
      onSubmit(trimmedValue);
      setValue('');
    } finally {
      setIsSubmitting(false);
    }
  }, [value, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel]
  );

  const canSubmit = value.trim().length > 0 && !isSubmitting;

  return (
    <Card className="w-full shadow-lg ring-2 ring-primary" variant="default">
      {selectedText && (
        <div className="px-3 py-2 bg-primary/5 border-b border-separator">
          <p className="text-xs text-muted-foreground">Commenting on:</p>
          <p className="text-sm text-foreground italic truncate">"{selectedText}"</p>
        </div>
      )}

      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Avatar size="sm">
            <Avatar.Fallback style={{ backgroundColor: color, color: 'white' }}>
              {initials}
            </Avatar.Fallback>
          </Avatar>
          <span className="font-medium text-sm text-foreground">{displayName}</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            onPress={onCancel}
            aria-label="Cancel comment"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <TextArea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a comment..."
          aria-label="New comment"
          rows={3}
          className="resize-none text-sm bg-surface-secondary"
          autoFocus={autoFocus}
          disabled={isSubmitting}
        />

        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">Enter to send, Shift+Enter for new line</p>
          <Button
            size="sm"
            variant="primary"
            onPress={handleSubmit}
            isDisabled={!canSubmit}
            isPending={isSubmitting}
          >
            <Send className="w-4 h-4" />
            Comment
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface AddCommentButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function AddCommentButton({ onPress, disabled = false }: AddCommentButtonProps) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onPress={onPress}
      isDisabled={disabled}
      className="opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label="Add comment"
    >
      <span className="w-4 h-4">+</span>
    </Button>
  );
}
