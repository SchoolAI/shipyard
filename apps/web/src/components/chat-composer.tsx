import { Button, Kbd, Tooltip } from '@heroui/react';
import type { PermissionMode } from '@shipyard/loro-schema';
import { ArrowUp, Mic, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { GitRepoInfo, ModelInfo } from '../hooks/use-machine-selection';
import type { SlashCommandAction } from '../hooks/use-slash-commands';
import { useSlashCommands } from '../hooks/use-slash-commands';
import { assertNever } from '../utils/assert-never';
import { AttachmentPopover } from './composer/attachment-popover';
import { ModelPicker, useModelPicker } from './composer/model-picker';
import { PermissionModePicker } from './composer/permission-mode-picker';
import { ReasoningEffort, type ReasoningLevel } from './composer/reasoning-effort';
import { SlashCommandMenu } from './composer/slash-command-menu';

export interface SubmitPayload {
  message: string;
  model: string;
  reasoningEffort: ReasoningLevel;
  permissionMode: PermissionMode;
}

interface ChatComposerProps {
  onSubmit: (payload: SubmitPayload) => void;
  onClearChat: () => void;
  availableModels?: ModelInfo[];
  availableEnvironments?: GitRepoInfo[];
  onEnvironmentSelect?: (path: string) => void;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  reasoningLevel: ReasoningLevel;
  onReasoningChange: (level: ReasoningLevel) => void;
  permissionMode: PermissionMode;
  onPermissionChange: (mode: PermissionMode) => void;
}

export interface ChatComposerHandle {
  focus: () => void;
}

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 24;

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  {
    onSubmit,
    onClearChat,
    availableModels,
    availableEnvironments,
    onEnvironmentSelect,
    selectedModelId,
    onModelChange,
    reasoningLevel,
    onReasoningChange,
    permissionMode,
    onPermissionChange,
  },
  ref
) {
  const [value, setValue] = useState('');
  const [stashedText, setStashedText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { models, reasoning } = useModelPicker(availableModels, selectedModelId);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
    }),
    []
  );

  useEffect(() => {
    if (reasoning && !reasoning.efforts.includes(reasoningLevel)) {
      onReasoningChange(reasoning.defaultEffort);
    }
  }, [reasoning, reasoningLevel, onReasoningChange]);

  const handleSlashExecute = useCallback(
    (action: SlashCommandAction) => {
      switch (action.kind) {
        case 'setPermissionMode':
          onPermissionChange(action.mode);
          break;
        case 'setModel':
          onModelChange(action.modelId);
          break;
        case 'setReasoning':
          onReasoningChange(action.level);
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
    [onModelChange, onReasoningChange, onPermissionChange, onClearChat, onEnvironmentSelect]
  );

  const rafRef = useRef<number>(0);
  const stashedTextRef = useRef(stashedText);
  stashedTextRef.current = stashedText;

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const resetTextareaHeight = useCallback(() => {
    rafRef.current = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.overflowY = 'hidden';
      }
    });
  }, []);

  const restoreStash = useCallback(() => {
    const pending = stashedTextRef.current;
    if (!pending) return;
    setStashedText('');
    setValue(pending);
    rafRef.current = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`;
      textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
    });
  }, []);

  const handleClearInput = useCallback(() => {
    setValue('');
    resetTextareaHeight();
    requestAnimationFrame(() => restoreStash());
  }, [resetTextareaHeight, restoreStash]);

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

    onSubmit({
      message: trimmed,
      model: selectedModelId,
      reasoningEffort: reasoningLevel,
      permissionMode,
    });
    setValue('');
    slashCommands.close();
    resetTextareaHeight();
    requestAnimationFrame(() => restoreStash());
  }, [
    value,
    onSubmit,
    slashCommands,
    selectedModelId,
    reasoningLevel,
    permissionMode,
    resetTextareaHeight,
    restoreStash,
  ]);

  const handleUnstash = useCallback(() => {
    if (!stashedText) return;
    setValue(stashedText);
    setStashedText('');
    rafRef.current = requestAnimationFrame(() => {
      adjustHeight();
      textareaRef.current?.focus();
    });
  }, [stashedText, adjustHeight]);

  const handleDiscardStash = useCallback(() => {
    setStashedText('');
  }, []);

  /**
   * NOTE: Raw addEventListener workaround — react-hotkeys-hook v5 enableOnFormTags
   * doesn't fire when textarea is focused (github.com/JohannesKlauss/react-hotkeys-hook/issues/1231).
   */
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const trimmed = textareaRef.current?.value.trim();
        if (trimmed) {
          setStashedText(trimmed);
          setValue('');
          resetTextareaHeight();
        } else if (stashedTextRef.current) {
          handleUnstash();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetTextareaHeight, handleUnstash]);

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
    <div className="w-full pb-1">
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

        {/* Stash indicator */}
        {stashedText && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center gap-2 px-4 pt-2.5 pb-1"
          >
            <button
              type="button"
              onClick={handleUnstash}
              aria-label="Restore stashed prompt"
              className="flex items-center gap-2 min-w-0 flex-1 group"
            >
              <span className="text-xs text-muted/50 shrink-0">Stashed</span>
              <span className="text-xs text-muted/40 truncate max-w-[200px]">{stashedText}</span>
              <span className="text-[10px] text-muted/30 shrink-0 hidden sm:inline-flex items-center gap-1">
                <Kbd className="text-[10px]">⌘S</Kbd>
                <span>restore</span>
                <span className="text-muted/20">·</span>
                <span>auto-restores on send</span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleDiscardStash}
              aria-label="Discard stashed prompt"
              className="text-muted/30 hover:text-muted/60 transition-colors shrink-0 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Textarea area */}
        <div className="px-4 pt-2 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Shipyard anything"
            aria-label="Message input"
            rows={1}
            className="w-full bg-transparent text-foreground placeholder-muted/70 text-sm leading-relaxed resize-none outline-none"
            style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px` }}
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2 gap-1">
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            <AttachmentPopover />
            <ModelPicker
              selectedModelId={selectedModelId}
              onModelChange={onModelChange}
              models={models}
            />
            {reasoning && (
              <ReasoningEffort
                level={reasoningLevel}
                onLevelChange={onReasoningChange}
                supportedEfforts={reasoning.efforts}
              />
            )}
            <PermissionModePicker mode={permissionMode} onModeChange={onPermissionChange} />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Voice input -- hidden on mobile (placeholder, saves space) */}
            <div className="hidden sm:flex">
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
            </div>
            <Button
              isIconOnly
              variant="primary"
              size="sm"
              aria-label="Send message"
              isDisabled={isEmpty}
              className="rounded-full w-9 h-9 sm:w-8 sm:h-8 min-w-0 bg-accent text-accent-foreground"
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
