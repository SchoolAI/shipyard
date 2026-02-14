import { Button, Tooltip } from '@heroui/react';
import type { GitRepoInfo, ModelInfo } from '@shipyard/session';
import { ArrowUp, Mic } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SlashCommandAction } from '../hooks/use-slash-commands';
import { useSlashCommands } from '../hooks/use-slash-commands';
import { assertNever } from '../utils/assert-never';
import { AttachmentPopover } from './composer/attachment-popover';
import { ModelPicker, useModelPicker } from './composer/model-picker';
import { PlanModeToggle } from './composer/plan-mode-toggle';
import { ReasoningEffort, type ReasoningLevel } from './composer/reasoning-effort';
import { SlashCommandMenu } from './composer/slash-command-menu';

interface ChatComposerProps {
  onSubmit: (message: string) => void;
  onClearChat: () => void;
  availableModels?: ModelInfo[];
  availableEnvironments?: GitRepoInfo[];
  onEnvironmentSelect?: (path: string) => void;
}

export interface ChatComposerHandle {
  focus: () => void;
}

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 24;

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  { onSubmit, onClearChat, availableModels, availableEnvironments, onEnvironmentSelect },
  ref
) {
  const [value, setValue] = useState('');
  const [planMode, setPlanMode] = useState(false);
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>('medium');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedModelId, setSelectedModelId, models, reasoning } =
    useModelPicker(availableModels);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
    }),
    []
  );

  useEffect(() => {
    if (reasoning && !reasoning.efforts.includes(reasoningLevel)) {
      setReasoningLevel(reasoning.defaultEffort);
    }
  }, [reasoning, reasoningLevel]);

  const handleSlashExecute = useCallback(
    (action: SlashCommandAction) => {
      switch (action.kind) {
        case 'toggle':
          if (action.target === 'planMode') {
            setPlanMode((prev) => !prev);
          }
          break;
        case 'setModel':
          setSelectedModelId(action.modelId);
          break;
        case 'setReasoning':
          setReasoningLevel(action.level);
          break;
        case 'setEnvironment':
          onEnvironmentSelect?.(action.path);
          break;
        case 'clear':
          onClearChat();
          break;
        case 'help':
          break;
        default:
          assertNever(action);
      }
    },
    [setSelectedModelId, onClearChat, onEnvironmentSelect]
  );

  const rafRef = useRef<number>(0);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleClearInput = useCallback(() => {
    setValue('');
    rafRef.current = requestAnimationFrame(() => {
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
    environments: availableEnvironments,
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

    rafRef.current = requestAnimationFrame(() => {
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

      if (e.key === 'Escape') {
        e.preventDefault();
        textareaRef.current?.blur();
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
      <div className="relative bg-surface rounded-xl border border-separator focus-within:border-focus focus-within:ring-1 focus-within:ring-focus">
        {slashCommands.isOpen && (
          <SlashCommandMenu
            commands={slashCommands.filteredCommands}
            selectedIndex={slashCommands.selectedIndex}
            onSelect={slashCommands.selectCommand}
            onClose={slashCommands.close}
            onHover={slashCommands.setSelectedIndex}
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
            <ModelPicker
              selectedModelId={selectedModelId}
              onModelChange={setSelectedModelId}
              models={models}
            />
            {reasoning && (
              <ReasoningEffort
                level={reasoningLevel}
                onLevelChange={setReasoningLevel}
                supportedEfforts={reasoning.efforts}
              />
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
                  className="rounded-full text-muted hover:text-foreground hover:bg-default w-11 h-11 sm:w-8 sm:h-8 min-w-0"
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
              className="rounded-full w-11 h-11 sm:w-8 sm:h-8 min-w-0 bg-accent text-accent-foreground"
              onPress={handleSubmit}
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
