import { Button } from '@heroui/react';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

interface DiffCommentInputProps {
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function DiffCommentInput({ onSubmit, onCancel }: DiffCommentInputProps) {
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setBody('');
  }, [body, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface border border-separator/50 rounded-lg mx-2 my-1">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        rows={3}
        className="w-full px-3 py-2 text-sm bg-background border border-separator/50 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-accent text-foreground placeholder:text-muted"
        aria-label="Comment text"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted" aria-hidden="true">
          {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to submit
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onPress={onCancel} className="text-xs h-7 px-2 min-w-0">
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            isDisabled={!body.trim()}
            onPress={handleSubmit}
            className="text-xs h-7 px-3 min-w-0"
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
