import { Button, TextArea } from '@heroui/react';
import { Send, X } from 'lucide-react';
import { useCallback, useState } from 'react';

interface ReplyFormProps {
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  showCancel?: boolean;
  autoFocus?: boolean;
}

export function ReplyForm({
  onSubmit,
  onCancel,
  placeholder = 'Write a comment...',
  showCancel = true,
  autoFocus = true,
}: ReplyFormProps) {
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
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
        onCancel?.();
      }
    },
    [handleSubmit, onCancel]
  );

  const canSubmit = value.trim().length > 0 && !isSubmitting;

  return (
    <div className="flex flex-col gap-2">
      <TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Comment reply"
        rows={2}
        className="resize-none text-sm bg-surface-secondary"
        autoFocus={autoFocus}
        disabled={isSubmitting}
      />
      <div className="flex justify-end gap-2">
        {showCancel && onCancel && (
          <Button size="sm" variant="ghost" onPress={onCancel} isDisabled={isSubmitting}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          onPress={handleSubmit}
          isDisabled={!canSubmit}
          isPending={isSubmitting}
        >
          <Send className="w-4 h-4" />
          Send
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Press Enter to send, Shift+Enter for new line</p>
    </div>
  );
}
