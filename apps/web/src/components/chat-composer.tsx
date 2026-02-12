import { Button } from '@heroui/react';
import { ArrowUp } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import { AttachmentPopover } from './composer/attachment-popover';
import { ModelPicker, useModelPicker } from './composer/model-picker';
import { PlanModeToggle } from './composer/plan-mode-toggle';
import type { ReasoningLevel } from './composer/reasoning-effort';
import { ReasoningEffort } from './composer/reasoning-effort';

interface ChatComposerProps {
  onSubmit: (message: string) => void;
}

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 24;

export function ChatComposer({ onSubmit }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [planMode, setPlanMode] = useState(false);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>('medium');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedModelId, setSelectedModelId, supportsReasoning } = useModelPicker();

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`;
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    setValue('');

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'hidden';
      }
    });
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const isEmpty = value.trim().length === 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-2">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-lg">
        {/* Textarea area */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Shipyard anything"
            rows={1}
            className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-sm leading-relaxed resize-none outline-none"
            style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px` }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1">
            <AttachmentPopover />
            <ModelPicker selectedModelId={selectedModelId} onModelChange={setSelectedModelId} />
            {supportsReasoning && (
              <ReasoningEffort level={reasoningLevel} onLevelChange={setReasoningLevel} />
            )}
            <PlanModeToggle isActive={planMode} onToggle={() => setPlanMode((p) => !p)} />
          </div>

          <Button
            isIconOnly
            variant="primary"
            size="sm"
            aria-label="Send message"
            isDisabled={isEmpty}
            className="rounded-full w-8 h-8 min-w-0"
            onPress={handleSubmit}
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
