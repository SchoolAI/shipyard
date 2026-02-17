import { Button, Chip, Tooltip } from '@heroui/react';
import type { ContentBlock, ImageSource } from '@shipyard/loro-schema';
import {
  AlertCircle,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Layers,
  Loader2,
  MessageSquareX,
  PanelRightOpen,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { usePlanApproval } from '../contexts/plan-approval-context';
import { useUIStore } from '../stores';
import { assertNever } from '../utils/assert-never';
import { type GroupedBlock, groupContentBlocks } from '../utils/group-content-blocks';
import {
  REHYPE_PLUGINS,
  REMARK_PLUGINS,
  markdownComponents as sharedMarkdownComponents,
} from '../utils/markdown-components';
import { summarizeToolAction, TOOL_ICON_LABELS } from '../utils/tool-summarizers';
import { AsciiShipThinking } from './thinking/ascii-ship';

export type MessageRole = 'user' | 'assistant';

export interface ChatMessageData {
  id: string;
  role: MessageRole;
  content: ContentBlock[];
  isThinking?: boolean;
  agentName?: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" role="status">
      <span className="sr-only">Agent is thinking</span>
      <span
        className="w-1.5 h-1.5 bg-muted rounded-full motion-safe:animate-bounce [animation-delay:0ms]"
        aria-hidden="true"
      />
      <span
        className="w-1.5 h-1.5 bg-muted rounded-full motion-safe:animate-bounce [animation-delay:150ms]"
        aria-hidden="true"
      />
      <span
        className="w-1.5 h-1.5 bg-muted rounded-full motion-safe:animate-bounce [animation-delay:300ms]"
        aria-hidden="true"
      />
    </span>
  );
}

/** Copy code content to clipboard and show a brief checkmark */
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  }, [code]);

  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="absolute top-2 right-2 rounded-md w-7 h-7 min-w-0 text-muted hover:text-foreground hover:bg-default/60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 motion-safe:transition-opacity"
          onPress={handleCopy}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{copied ? 'Copied!' : 'Copy'}</Tooltip.Content>
    </Tooltip>
  );
}

interface ReactElementWithChildren {
  props: { children?: React.ReactNode };
}

/** Type guard for React elements that have a props.children field */
function isElementWithChildren(node: unknown): node is ReactElementWithChildren {
  if (node === null || typeof node !== 'object' || !('props' in node)) {
    return false;
  }
  const record: Record<string, unknown> = node;
  return typeof record.props === 'object' && record.props !== null;
}

/** Extract plain text from React children (handles nested elements from highlight) */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (isElementWithChildren(children)) {
    return extractText(children.props.children);
  }
  return '';
}

const markdownComponents: typeof sharedMarkdownComponents = {
  ...sharedMarkdownComponents,
  pre({ children, node: _, ...rest }) {
    const innerContent = isElementWithChildren(children) ? children.props.children : children;
    const codeText = extractText(innerContent ?? children);

    return (
      <div className="group relative my-2">
        <pre
          className="bg-[var(--color-code-block)] rounded-md p-3 overflow-x-auto text-sm leading-snug border border-separator/30"
          {...rest}
        >
          {children}
        </pre>
        <CopyButton code={codeText} />
      </div>
    );
  },
};

interface ToolCallLineProps {
  toolUse: ContentBlock & { type: 'tool_use' };
  toolResult: (ContentBlock & { type: 'tool_result' }) | null;
}

function ToolCallLine({ toolUse, toolResult }: ToolCallLineProps) {
  const isError = toolResult?.isError ?? false;
  const isPending = toolResult === null;
  const [showDetails, setShowDetails] = useState(isError);
  const [showInput, setShowInput] = useState(false);
  const detailsPanelId = useId();
  const inputPanelId = useId();

  useEffect(() => {
    if (isError) setShowDetails(true);
  }, [isError]);

  const summary = summarizeToolAction(toolUse.toolName, toolUse.input);
  const iconLabel = TOOL_ICON_LABELS[toolUse.toolName] ?? toolUse.toolName;

  const formattedInput = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(toolUse.input), null, 2);
    } catch {
      return toolUse.input;
    }
  }, [toolUse.input]);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-2 w-full min-h-[36px] sm:min-h-0 py-0.5 min-w-0 text-left rounded hover:bg-default/20 motion-safe:transition-colors group/tool"
        aria-expanded={showDetails}
        aria-controls={detailsPanelId}
        aria-disabled={isPending || undefined}
        onClick={() => {
          if (!isPending) setShowDetails((prev) => !prev);
        }}
      >
        {isPending ? (
          <Loader2
            className="w-3.5 h-3.5 text-muted shrink-0 motion-safe:animate-spin"
            role="status"
            aria-label="Running"
          />
        ) : isError ? (
          <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-success/60 shrink-0" aria-hidden="true" />
        )}

        <span
          className="text-xs text-foreground/50 font-mono shrink-0 w-10 truncate"
          title={iconLabel}
        >
          {toolUse.toolName}
        </span>

        <span
          className="text-xs text-foreground/70 font-mono truncate min-w-0 flex-1"
          title={summary}
        >
          {summary}
        </span>

        {!isPending && (
          <ChevronDown
            className={`w-3 h-3 text-muted shrink-0 opacity-0 group-hover/tool:opacity-100 focus-visible:opacity-100 motion-safe:transition-all ${showDetails ? 'rotate-180 opacity-100' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {showDetails && toolResult && (
        <div
          id={detailsPanelId}
          role="region"
          aria-label={`${toolUse.toolName} result`}
          className={`ml-5 border-l-2 ${isError ? 'border-l-danger/50' : 'border-l-success/30'} pl-3 mt-0.5 mb-1`}
        >
          <span className="sr-only">{isError ? 'Error output' : 'Successful output'}</span>
          <pre className="text-[0.6875rem] text-foreground/70 font-mono overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
            {toolResult.content}
          </pre>

          <button
            type="button"
            className="flex items-center gap-1 mt-1.5 min-h-[36px] sm:min-h-0 text-[0.6875rem] text-muted hover:text-foreground motion-safe:transition-colors"
            aria-expanded={showInput}
            aria-controls={inputPanelId}
            onClick={(e) => {
              e.stopPropagation();
              setShowInput((prev) => !prev);
            }}
          >
            <ChevronDown
              className={`w-3 h-3 motion-safe:transition-transform ${showInput ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            {showInput ? 'Hide input' : 'Show input'}
          </button>
          {showInput && (
            <pre
              id={inputPanelId}
              className="mt-1 p-2 rounded-md bg-background text-[0.6875rem] text-foreground/50 font-mono overflow-x-auto max-h-48 border border-separator/30"
            >
              {formattedInput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

interface ThinkingBlockProps {
  block: ContentBlock & { type: 'thinking' };
}

function ThinkingBlock({ block }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-2 w-full min-h-[36px] sm:min-h-0 py-0.5 min-w-0 text-left rounded hover:bg-default/20 motion-safe:transition-colors group/thinking"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <BrainCircuit className="w-3.5 h-3.5 text-secondary/60 shrink-0" aria-hidden="true" />

        <span className="text-xs text-foreground/50 font-mono shrink-0">Reasoning</span>

        <span className="text-xs text-muted truncate min-w-0 flex-1">
          {expanded ? '' : block.text.slice(0, 80).replace(/\n/g, ' ')}
          {!expanded && block.text.length > 80 ? '...' : ''}
        </span>

        <ChevronDown
          className={`w-3 h-3 text-muted shrink-0 opacity-0 group-hover/thinking:opacity-100 focus-visible:opacity-100 motion-safe:transition-all ${expanded ? 'rotate-180 opacity-100' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label="Reasoning content"
          className="ml-5 border-l-2 border-l-secondary/30 pl-3 mt-0.5 mb-1"
        >
          <span className="sr-only">Extended thinking</span>
          <pre className="text-[0.6875rem] text-foreground/70 font-mono overflow-x-auto max-h-96 whitespace-pre-wrap break-words">
            {block.text}
          </pre>
        </div>
      )}
    </div>
  );
}

interface SubagentGroupProps {
  taskToolUse: ContentBlock & { type: 'tool_use' };
  taskToolResult: (ContentBlock & { type: 'tool_result' }) | null;
  children: GroupedBlock[];
}

function SubagentGroup({ taskToolUse, taskToolResult, children }: SubagentGroupProps) {
  const isPending = taskToolResult === null;
  const isError = taskToolResult?.isError ?? false;
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const toolCallCount = children.filter(
    (g) => g.kind === 'tool_invocation' || g.kind === 'subagent_group'
  ).length;

  const description = useMemo(() => {
    try {
      // eslint-disable-next-line no-restricted-syntax -- daemon-serialized JSON
      const input = JSON.parse(taskToolUse.input) as Record<string, unknown>;
      return typeof input.description === 'string' ? input.description : 'Subagent';
    } catch {
      return 'Subagent';
    }
  }, [taskToolUse.input]);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-2 w-full min-h-[36px] sm:min-h-0 py-0.5 min-w-0 text-left rounded hover:bg-default/20 motion-safe:transition-colors group/subagent"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {isPending ? (
          <Loader2
            className="w-3.5 h-3.5 text-muted shrink-0 motion-safe:animate-spin"
            role="status"
            aria-label="Running"
          />
        ) : isError ? (
          <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-success/60 shrink-0" aria-hidden="true" />
        )}
        <Layers className="w-3.5 h-3.5 text-secondary/60 shrink-0" aria-hidden="true" />
        <span className="text-xs text-foreground/50 font-mono shrink-0">Task</span>

        <span
          className="text-xs text-foreground/70 font-mono truncate min-w-0 flex-1"
          title={description}
        >
          {description}
        </span>

        {toolCallCount > 0 && (
          <span className="text-[0.6875rem] text-muted shrink-0">
            ({toolCallCount} tool{toolCallCount === 1 ? '' : 's'})
          </span>
        )}

        <ChevronDown
          className={`w-3 h-3 text-muted shrink-0 opacity-0 group-hover/subagent:opacity-100 focus-visible:opacity-100 motion-safe:transition-all ${expanded ? 'rotate-180 opacity-100' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label={`Subagent: ${description}`}
          className="ml-5 border-l-2 border-l-secondary/30 pl-3 mt-0.5 mb-1 space-y-1"
        >
          {children.map((child, i) => (
            <GroupedBlockRenderer
              key={
                child.kind === 'tool_invocation'
                  ? child.toolUse.toolUseId
                  : child.kind === 'subagent_group'
                    ? child.taskToolUse.toolUseId
                    : child.kind === 'plan'
                      ? child.toolUse.toolUseId
                      : `${child.kind}-${i}`
              }
              group={child}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanBlock({ group }: { group: GroupedBlock & { kind: 'plan' } }) {
  const { pendingPermissions, respondToPermission, plans } = usePlanApproval();
  const [expanded, setExpanded] = useState(true);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const contentId = useId();

  const planVersion = plans.find((p) => p.toolUseId === group.toolUse.toolUseId);
  const reviewStatus = planVersion?.reviewStatus ?? 'pending';
  const isPending = pendingPermissions.has(group.toolUse.toolUseId);

  const borderColor =
    reviewStatus === 'approved'
      ? 'border-l-success'
      : reviewStatus === 'changes-requested'
        ? 'border-l-warning'
        : 'border-l-secondary';

  return (
    <div
      role="article"
      aria-label="Plan"
      className={`${borderColor} border-l-3 rounded-xl border border-separator/30 bg-surface/30 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-separator/30">
        <ClipboardList className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Plan</span>
        <span className="ml-auto shrink-0" />
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="Open plan in panel"
          onPress={() => useUIStore.getState().setActiveSidePanel('plan')}
          className="text-muted hover:text-foreground w-7 h-7 min-w-0"
        >
          <PanelRightOpen className="w-3.5 h-3.5" />
        </Button>
        <button
          type="button"
          aria-label={expanded ? 'Collapse plan' : 'Expand plan'}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((prev) => !prev)}
          className="text-muted hover:text-foreground"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 motion-safe:transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded && (
        <div
          id={contentId}
          className="px-4 py-3 max-h-80 overflow-y-auto text-sm text-foreground/90 leading-normal prose-shipyard"
        >
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            rehypePlugins={REHYPE_PLUGINS}
            components={markdownComponents}
          >
            {group.markdown}
          </ReactMarkdown>
        </div>
      )}

      {isPending && (
        <div className="flex flex-col items-end gap-2 px-4 py-3 border-t border-separator/30">
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              className="min-w-[100px]"
              onPress={() => respondToPermission(group.toolUse.toolUseId, 'approved')}
            >
              <Check className="w-3.5 h-3.5" />
              Approve
            </Button>
            <Button variant="ghost" size="sm" onPress={() => setShowFeedbackInput((prev) => !prev)}>
              <MessageSquareX className="w-3.5 h-3.5" />
              Request Changes
            </Button>
          </div>
          {showFeedbackInput && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Describe requested changes..."
                className="flex-1 text-sm bg-background border border-separator/50 rounded-md px-3 py-1.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-secondary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && feedbackText.trim()) {
                    respondToPermission(group.toolUse.toolUseId, 'denied', {
                      message: feedbackText.trim(),
                    });
                    setShowFeedbackInput(false);
                    setFeedbackText('');
                  }
                }}
                aria-label="Feedback for requested changes"
              />
              <Button
                variant="ghost"
                size="sm"
                isDisabled={!feedbackText.trim()}
                onPress={() => {
                  respondToPermission(group.toolUse.toolUseId, 'denied', {
                    message: feedbackText.trim(),
                  });
                  setShowFeedbackInput(false);
                  setFeedbackText('');
                }}
              >
                Send
              </Button>
            </div>
          )}
        </div>
      )}

      {!isPending && reviewStatus === 'approved' && (
        <div className="flex justify-end px-4 py-2 border-t border-separator/30">
          <Chip size="sm" variant="soft" color="success">
            <Check className="w-3.5 h-3.5" />
            Approved
          </Chip>
        </div>
      )}
      {!isPending && reviewStatus === 'changes-requested' && (
        <div className="flex flex-col items-end px-4 py-2 border-t border-separator/30">
          <Chip size="sm" variant="soft" color="warning">
            Changes Requested
          </Chip>
          {planVersion?.reviewFeedback && (
            <p className="mt-1 text-xs text-muted">{planVersion.reviewFeedback}</p>
          )}
        </div>
      )}
    </div>
  );
}

const SAFE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function imageSourceToUrl(source: ImageSource): string | null {
  if (source.type === 'base64') {
    if (!SAFE_IMAGE_TYPES.has(source.mediaType)) return null;
    return `data:${source.mediaType};base64,${source.data}`;
  }
  return null;
}

function ImageBlockView({ block }: { block: ContentBlock & { type: 'image' } }) {
  const src = imageSourceToUrl(block.source);

  if (!src) {
    return (
      <div className="text-xs text-muted italic px-2 py-1 border border-separator/30 rounded">
        Unsupported attachment
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="User attachment"
      className="max-w-full max-h-80 rounded-lg border border-separator"
    />
  );
}

function GroupedBlockRenderer({ group }: { group: GroupedBlock }) {
  switch (group.kind) {
    case 'text':
      return (
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={markdownComponents}
        >
          {group.block.text}
        </ReactMarkdown>
      );
    case 'image':
      return <ImageBlockView block={group.block} />;
    case 'thinking':
      return <ThinkingBlock block={group.block} />;
    case 'tool_invocation':
      return <ToolCallLine toolUse={group.toolUse} toolResult={group.toolResult} />;
    case 'subagent_group':
      return (
        <SubagentGroup
          taskToolUse={group.taskToolUse}
          taskToolResult={group.taskToolResult}
          children={group.children}
        />
      );
    case 'plan':
      return <PlanBlock group={group} />;
    default:
      return assertNever(group);
  }
}

const VERSION_RE = /^(.+?)\s+([\d.]+)$/;

function ModelLabel({ name }: { name: string }) {
  const match = VERSION_RE.exec(name);
  if (match) {
    return (
      <span className="text-xs leading-none mb-1.5 block">
        <span className="sr-only">Model: </span>
        <span className="font-medium text-muted">{match[1]}</span>
        <span className="font-normal text-muted/50 ml-0.5">{match[2]}</span>
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-muted leading-none mb-1.5 block">
      <span className="sr-only">Model: </span>
      {name}
    </span>
  );
}

function AgentMessage({ message }: ChatMessageProps) {
  const grouped = useMemo(() => groupContentBlocks(message.content), [message.content]);
  const modelLabel = message.agentName ?? 'Agent';

  const hasVisibleContent = message.isThinking || grouped.some((g) => g.kind !== 'thinking');
  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div className="flex flex-col max-w-3xl">
      <ModelLabel name={modelLabel} />
      {message.isThinking ? (
        <div className="py-1">
          <AsciiShipThinking />
        </div>
      ) : (
        <div className="text-sm text-foreground/90 leading-normal prose-shipyard space-y-1.5">
          {grouped.map((group, i) => (
            <GroupedBlockRenderer
              key={
                group.kind === 'tool_invocation'
                  ? group.toolUse.toolUseId
                  : group.kind === 'subagent_group'
                    ? group.taskToolUse.toolUseId
                    : group.kind === 'plan'
                      ? group.toolUse.toolUseId
                      : `${group.kind}-${i}`
              }
              group={group}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserMessage({ message }: ChatMessageProps) {
  const textBlocks = message.content.filter(
    (b): b is ContentBlock & { type: 'text' } => b.type === 'text'
  );
  const imageBlocks = message.content.filter(
    (b): b is ContentBlock & { type: 'image' } => b.type === 'image'
  );
  const textContent = textBlocks.map((b) => b.text).join('\n');

  return (
    <div className="flex justify-end max-w-3xl ml-auto">
      <div className="bg-default rounded-2xl px-4 py-2.5 max-w-[80%]">
        <span className="sr-only">You:</span>
        {textContent && (
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {textContent}
          </div>
        )}
        {imageBlocks.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${textContent ? 'mt-2' : ''}`}>
            {imageBlocks.map((block, i) => (
              <ImageBlockView key={`img-${i}`} block={block} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message} />;
    case 'assistant':
      return <AgentMessage message={message} />;
    default:
      return assertNever(message.role);
  }
}
