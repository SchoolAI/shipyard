import { Button, Kbd, Tooltip } from '@heroui/react';
import type { PermissionMode } from '@shipyard/loro-schema';
import { ArrowUp, Mic, Sparkles, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { HOTKEYS } from '../constants/hotkeys';
import { useComposerHistory, useComposerUndoShortcut } from '../hooks/use-composer-history';
import type { GitRepoInfo, ModelInfo } from '../hooks/use-machine-selection';
import type { SlashCommandAction } from '../hooks/use-slash-commands';
import { useSlashCommands } from '../hooks/use-slash-commands';
import { assertNever } from '../utils/assert-never';
import type { ImageAttachment } from '../utils/image-utils';
import { extractImagesFromClipboard, processImageFile } from '../utils/image-utils';
import { AttachmentPopover } from './composer/attachment-popover';
import { ImagePreview } from './composer/image-preview';
import { ModelPicker, useModelPicker } from './composer/model-picker';
import { PermissionModePicker } from './composer/permission-mode-picker';
import { ReasoningEffort, type ReasoningLevel } from './composer/reasoning-effort';
import { SlashCommandMenu } from './composer/slash-command-menu';

export interface SubmitPayload {
  message: string;
  images: ImageAttachment[];
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
  isSubmitDisabled?: boolean;
  submitDisabledReason?: string;
  isVoiceRecording?: boolean;
  isVoiceSupported?: boolean;
  onVoiceToggle?: () => void;
  voiceInterimText?: string;
  isEnhancing?: boolean;
  onEnhance?: () => void;
  onCreateWorktree?: () => void;
  isEnvironmentLocked?: boolean;
}

export interface ChatComposerHandle {
  focus: () => void;
  insertText: (text: string) => void;
  replaceText: (text: string) => void;
  /** Write directly to the DOM without React re-renders. Use during streaming. */
  streamText: (text: string) => void;
  getText: () => string;
  clearHistory: () => void;
}

const MAX_HEIGHT = 200;
const MIN_HEIGHT = 24;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: composer integrates many keyboard shortcuts and conditional UI; further extraction would hurt readability
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
    isSubmitDisabled,
    submitDisabledReason,
    isVoiceRecording,
    isVoiceSupported,
    onVoiceToggle,
    voiceInterimText,
    isEnhancing,
    onEnhance,
    onCreateWorktree,
    isEnvironmentLocked,
  },
  ref
) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [stashedText, setStashedText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const history = useComposerHistory();
  const { models, reasoning } = useModelPicker(availableModels, selectedModelId);

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
          if (!isEnvironmentLocked) onEnvironmentSelect?.(action.path);
          break;
        case 'clear':
          onClearChat();
          break;
        case 'help':
          break;
        case 'createWorktree':
          if (!isEnvironmentLocked) onCreateWorktree?.();
          break;
        default:
          assertNever(action);
      }
    },
    [
      onModelChange,
      onReasoningChange,
      onPermissionChange,
      onClearChat,
      onEnvironmentSelect,
      onCreateWorktree,
      isEnvironmentLocked,
    ]
  );

  const rafRef = useRef<number>(0);
  const adjustRafRef = useRef<number>(0);
  const streamSnapshotTakenRef = useRef(false);
  const stashedTextRef = useRef(stashedText);
  stashedTextRef.current = stashedText;

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(adjustRafRef.current);
    };
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
    isEnvironmentLocked,
  });

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`;
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  /** Schedule adjustHeight for the next animation frame, coalescing multiple calls into one. */
  const scheduleAdjustHeight = useCallback(() => {
    cancelAnimationFrame(adjustRafRef.current);
    adjustRafRef.current = requestAnimationFrame(() => {
      adjustHeight();
    });
  }, [adjustHeight]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      insertText: (text: string) => {
        setValue((prev) => {
          const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !text.startsWith(' ');
          return prev + (needsSpace ? ' ' : '') + text;
        });
        requestAnimationFrame(() => {
          adjustHeight();
          textareaRef.current?.focus();
        });
      },
      replaceText: (text: string) => {
        history.snapshotBeforeReplace(textareaRef.current?.value ?? '');
        streamSnapshotTakenRef.current = false;
        setValue(text);
        requestAnimationFrame(() => {
          adjustHeight();
        });
      },
      streamText: (text: string) => {
        if (!streamSnapshotTakenRef.current) {
          history.snapshotBeforeReplace(textareaRef.current?.value ?? '');
          streamSnapshotTakenRef.current = true;
        }
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.value = text;
        }
        scheduleAdjustHeight();
      },
      getText: () => textareaRef.current?.value ?? '',
      clearHistory: history.clear,
    }),
    [adjustHeight, scheduleAdjustHeight, history]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      history.redoStack.current = [];
      setValue(newValue);
      slashCommands.handleInputChange(newValue);
      adjustHeight();
    },
    [adjustHeight, slashCommands, history]
  );

  const addImages = useCallback(async (files: File[]) => {
    const results = await Promise.allSettled(files.map(processImageFile));
    const successful = results
      .filter((r): r is PromiseFulfilledResult<ImageAttachment> => r.status === 'fulfilled')
      .map((r) => r.value);
    if (successful.length > 0) {
      setImages((prev) => [...prev, ...successful]);
    }
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = extractImagesFromClipboard(e.clipboardData);
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImages(imageFiles);
      }
    },
    [addImages]
  );

  const handleSubmit = useCallback(() => {
    if (isSubmitDisabled) return;
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;

    onSubmit({
      message: trimmed,
      images,
      model: selectedModelId,
      reasoningEffort: reasoningLevel,
      permissionMode,
    });
    setValue('');
    setImages([]);
    history.clear();
    slashCommands.close();
    resetTextareaHeight();
    requestAnimationFrame(() => restoreStash());
  }, [
    isSubmitDisabled,
    value,
    images,
    onSubmit,
    slashCommands,
    selectedModelId,
    reasoningLevel,
    permissionMode,
    history,
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

  const handleStashShortcut = useCallback(() => {
    const trimmed = textareaRef.current?.value.trim();
    if (trimmed) {
      setStashedText(trimmed);
      setValue('');
      resetTextareaHeight();
    } else if (stashedTextRef.current) {
      handleUnstash();
    }
  }, [resetTextareaHeight, handleUnstash]);

  const handleEnhanceShortcut = useCallback(() => {
    if (!onEnhance) return;
    if (isEnhancing) {
      onEnhance();
      return;
    }
    const hasText = (textareaRef.current?.value.trim().length ?? 0) > 0;
    if (isSubmitDisabled || !hasText) return;
    onEnhance();
  }, [isSubmitDisabled, isEnhancing, onEnhance]);

  /**
   * NOTE: Raw addEventListener workaround -- react-hotkeys-hook v5 enableOnFormTags
   * doesn't fire when textarea is focused (github.com/JohannesKlauss/react-hotkeys-hook/issues/1231).
   */
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleStashShortcut();
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleEnhanceShortcut();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStashShortcut, handleEnhanceShortcut]);

  useComposerUndoShortcut(history, setValue, adjustHeight, textareaRef);

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

  const isEmpty = value.trim().length === 0 && images.length === 0;
  const enhanceLabel = isEnhancing ? 'Cancel enhancement' : 'Enhance prompt';
  const enhanceClassName = isEnhancing
    ? 'bg-secondary/20 text-secondary motion-safe:animate-pulse'
    : 'text-muted hover:text-foreground hover:bg-default';

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
                <Kbd className="text-[10px]">⌃S</Kbd>
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

        <ImagePreview
          images={images}
          onRemove={(index) => setImages((prev) => prev.filter((_, i) => i !== index))}
        />

        <div className="px-4 pt-2 pb-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isSubmitDisabled ? 'Connect a machine to start...' : 'Ask Shipyard anything'
            }
            aria-label="Message input"
            readOnly={isEnhancing}
            rows={1}
            className="w-full bg-transparent text-foreground placeholder-muted/70 text-sm leading-relaxed resize-none outline-none"
            style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px` }}
          />
          {voiceInterimText && (
            <p
              className="text-xs text-muted/60 italic mt-1 motion-safe:animate-pulse"
              aria-live="polite"
              aria-atomic="true"
            >
              {voiceInterimText}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between px-3 pb-2 gap-1">
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            <AttachmentPopover onFilesSelected={addImages} />
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
            {/** Voice input -- hidden on mobile and when unsupported */}
            {isVoiceSupported === true && onVoiceToggle && (
              <div className="hidden sm:flex">
                <Tooltip>
                  <Tooltip.Trigger>
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      aria-label={isVoiceRecording ? 'Stop voice input' : 'Start voice input'}
                      aria-keyshortcuts="Meta+Alt+M"
                      className={`rounded-full w-8 h-8 min-w-0 ${
                        isVoiceRecording
                          ? 'bg-danger text-danger-foreground motion-safe:animate-pulse'
                          : 'text-muted hover:text-foreground hover:bg-default'
                      }`}
                      onPress={onVoiceToggle}
                    >
                      <Mic className="w-4 h-4" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <span className="flex items-center gap-2">
                      {isVoiceRecording ? 'Stop recording' : 'Voice input'}
                      <Kbd>{HOTKEYS.voiceInput.display}</Kbd>
                    </span>
                  </Tooltip.Content>
                </Tooltip>
              </div>
            )}
            {onEnhance && (
              <Tooltip>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label={enhanceLabel}
                    aria-keyshortcuts="Meta+Shift+E"
                    isDisabled={isEmpty || (isSubmitDisabled && !isEnhancing)}
                    className={`rounded-full w-9 h-9 sm:w-8 sm:h-8 min-w-0 ${enhanceClassName}`}
                    onPress={onEnhance}
                  >
                    <Sparkles className="w-4 h-4" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <span className="flex items-center gap-2">
                    {enhanceLabel}
                    <Kbd>{HOTKEYS.enhancePrompt.display}</Kbd>
                  </span>
                </Tooltip.Content>
              </Tooltip>
            )}
            <Tooltip isDisabled={!isSubmitDisabled}>
              <Tooltip.Trigger>
                <span tabIndex={isSubmitDisabled ? 0 : -1} className="inline-flex">
                  <Button
                    isIconOnly
                    variant="primary"
                    size="sm"
                    aria-label="Send message"
                    isDisabled={isEmpty || isSubmitDisabled}
                    className="rounded-full w-9 h-9 sm:w-8 sm:h-8 min-w-0 bg-accent text-accent-foreground"
                    onPress={handleSubmit}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>{submitDisabledReason}</Tooltip.Content>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
});
