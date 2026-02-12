import { Button, Tooltip } from '@heroui/react';
import { ArrowUp, Mic } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { SlashCommand } from '../hooks/use-slash-commands';
import { useSlashCommands } from '../hooks/use-slash-commands';
import { AttachmentPopover } from './composer/attachment-popover';
import { ModelPicker, useModelPicker } from './composer/model-picker';
import { PlanModeToggle } from './composer/plan-mode-toggle';
import type { ReasoningLevel } from './composer/reasoning-effort';
import { ReasoningEffort } from './composer/reasoning-effort';
import { SlashCommandMenu } from './composer/slash-command-menu';

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

  const handleSlashExecute = useCallback((_command: SlashCommand) => {
    /** TODO: wire up actual command execution */
  }, []);

  const handleClearInput = useCallback(() => {
    setValue('');
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'hidden';
      }
    });
  }, []);

  const slashCommands = useSlashCommands({
    onExecute: handleSlashExecute,
    onClearInput: handleClearInput,
  });

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
      const newValue = e.target.value;
      setValue(newValue);
      slashCommands.handleInputChange(newValue);
      adjustHeight();
    },
    [adjustHeight, slashCommands]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    setValue('');
    slashCommands.close();

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'hidden';
      }
    });
  }, [value, onSubmit, slashCommands]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashCommands.handleKeyDown(e)) {
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, slashCommands]
  );

  const isEmpty = value.trim().length === 0;

  return (
    <div className="w-full pb-2">
      <div className="relative bg-surface rounded-2xl border border-separator shadow-lg">
        {slashCommands.isOpen && (
          <SlashCommandMenu
            commands={slashCommands.filteredCommands}
            selectedIndex={slashCommands.selectedIndex}
            onSelect={slashCommands.selectCommand}
            onClose={slashCommands.close}
          />
        )}

        {/* Textarea area */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Shipyard anything"
            aria-label="Message input"
            rows={1}
            className="w-full bg-transparent text-foreground placeholder-muted text-sm leading-relaxed resize-none outline-none"
            style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px` }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-3 gap-1">
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            <AttachmentPopover />
            <ModelPicker selectedModelId={selectedModelId} onModelChange={setSelectedModelId} />
            {supportsReasoning && (
              <ReasoningEffort level={reasoningLevel} onLevelChange={setReasoningLevel} />
            )}
            <PlanModeToggle isActive={planMode} onToggle={() => setPlanMode((p) => !p)} />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label="Voice input"
                  className="rounded-full text-muted hover:text-foreground hover:bg-default w-8 h-8 min-w-0"
                >
                  <Mic className="w-4 h-4" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>Voice input</Tooltip.Content>
            </Tooltip>
            <Button
              isIconOnly
              variant="primary"
              size="sm"
              aria-label="Send message"
              isDisabled={isEmpty}
              className="rounded-full w-8 h-8 min-w-0 bg-accent text-accent-foreground"
              onPress={handleSubmit}
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
