import { Button, Tooltip } from '@heroui/react';
import type { ContentBlock } from '@shipyard/loro-schema';
import {
  AlertCircle,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Layers,
  Loader2,
} from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { assertNever } from '../utils/assert-never';
import { type GroupedBlock, groupContentBlocks } from '../utils/group-content-blocks';
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

/** Custom components for ReactMarkdown to apply Shipyard theme */
const markdownComponents: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
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

  code({ className, children, node: _, ...rest }) {
    const isBlock = className?.includes('hljs') || className?.includes('language-');
    if (isBlock) {
      return (
        <code className={`${className ?? ''} text-[0.875rem]`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-default/70 text-accent px-1.5 py-0.5 rounded text-[0.8125rem] font-mono"
        {...rest}
      >
        {children}
      </code>
    );
  },

  h1({ children, node: _, ...rest }) {
    return (
      <h1 className="text-lg font-bold text-foreground mt-4 mb-2" {...rest}>
        {children}
      </h1>
    );
  },

  h2({ children, node: _, ...rest }) {
    return (
      <h2 className="text-base font-semibold text-foreground mt-3 mb-1.5" {...rest}>
        {children}
      </h2>
    );
  },

  h3({ children, node: _, ...rest }) {
    return (
      <h3 className="text-sm font-semibold text-foreground mt-2 mb-1" {...rest}>
        {children}
      </h3>
    );
  },

  p({ children, node: _, ...rest }) {
    return (
      <p className="mb-2 last:mb-0 leading-relaxed" {...rest}>
        {children}
      </p>
    );
  },

  a({ children, href, node: _, ...rest }) {
    return (
      <a
        href={href}
        className="text-secondary underline underline-offset-2 hover:text-wave-light transition-colors"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },

  ul({ children, node: _, ...rest }) {
    return (
      <ul className="list-disc pl-5 mb-2 space-y-0.5" {...rest}>
        {children}
      </ul>
    );
  },

  ol({ children, node: _, ...rest }) {
    return (
      <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...rest}>
        {children}
      </ol>
    );
  },

  li({ children, node: _, ...rest }) {
    return (
      <li className="leading-normal" {...rest}>
        {children}
      </li>
    );
  },

  blockquote({ children, node: _, ...rest }) {
    return (
      <blockquote
        className="border-l-2 border-accent pl-3 my-2 text-foreground/80 italic"
        {...rest}
      >
        {children}
      </blockquote>
    );
  },

  table({ children, node: _, ...rest }) {
    return (
      <div className="overflow-x-auto my-2">
        <table
          className="w-full text-sm border-collapse border border-separator rounded-lg"
          {...rest}
        >
          {children}
        </table>
      </div>
    );
  },

  thead({ children, node: _, ...rest }) {
    return (
      <thead className="bg-default/50" {...rest}>
        {children}
      </thead>
    );
  },

  th({ children, node: _, ...rest }) {
    return (
      <th
        className="text-left font-semibold px-3 py-2 border border-separator text-foreground"
        {...rest}
      >
        {children}
      </th>
    );
  },

  td({ children, node: _, ...rest }) {
    return (
      <td className="px-3 py-2 border border-separator" {...rest}>
        {children}
      </td>
    );
  },

  hr({ node: _, ...rest }) {
    return <hr className="border-separator my-2" {...rest} />;
  },

  strong({ children, node: _, ...rest }) {
    return (
      <strong className="font-semibold text-foreground" {...rest}>
        {children}
      </strong>
    );
  },

  input({ checked, node: _, ...rest }) {
    return (
      <input
        type="checkbox"
        checked={checked}
        disabled
        className="mr-1.5 accent-accent"
        {...rest}
      />
    );
  },
};

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

/* ---------- ToolCallLine ---------- */

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
      {/* Single-line summary row */}
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
        {/* Status icon */}
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

        {/* Tool name */}
        <span
          className="text-xs text-foreground/50 font-mono shrink-0 w-10 truncate"
          title={iconLabel}
        >
          {toolUse.toolName}
        </span>

        {/* Summary */}
        <span
          className="text-xs text-foreground/70 font-mono truncate min-w-0 flex-1"
          title={summary}
        >
          {summary}
        </span>

        {/* Chevron */}
        {!isPending && (
          <ChevronDown
            className={`w-3 h-3 text-muted shrink-0 opacity-0 group-hover/tool:opacity-100 focus-visible:opacity-100 motion-safe:transition-all ${showDetails ? 'rotate-180 opacity-100' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Expanded details */}
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

          {/* Secondary: show raw input */}
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

/* ---------- ThinkingBlock ---------- */

interface ThinkingBlockProps {
  block: ContentBlock & { type: 'thinking' };
}

function ThinkingBlock({ block }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <div>
      {/* Single-line disclosure trigger */}
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

      {/* Expanded content */}
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

/* ---------- SubagentGroup ---------- */

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
      {/* Collapsed single-line summary */}
      <button
        type="button"
        className="flex items-center gap-2 w-full min-h-[36px] sm:min-h-0 py-0.5 min-w-0 text-left rounded hover:bg-default/20 motion-safe:transition-colors group/subagent"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Status icon */}
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

        {/* Subagent icon + label */}
        <Layers className="w-3.5 h-3.5 text-secondary/60 shrink-0" aria-hidden="true" />
        <span className="text-xs text-foreground/50 font-mono shrink-0">Task</span>

        {/* Description */}
        <span
          className="text-xs text-foreground/70 font-mono truncate min-w-0 flex-1"
          title={description}
        >
          {description}
        </span>

        {/* Tool call count */}
        {toolCallCount > 0 && (
          <span className="text-[0.6875rem] text-muted shrink-0">
            ({toolCallCount} tool{toolCallCount === 1 ? '' : 's'})
          </span>
        )}

        {/* Chevron */}
        <ChevronDown
          className={`w-3 h-3 text-muted shrink-0 opacity-0 group-hover/subagent:opacity-100 focus-visible:opacity-100 motion-safe:transition-all ${expanded ? 'rotate-180 opacity-100' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Expanded children */}
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

/* ---------- GroupedBlockRenderer ---------- */

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
    default:
      return assertNever(group);
  }
}

/* ---------- Model label ---------- */

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

/* ---------- Message components ---------- */

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
  const textContent = message.content
    .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return (
    <div className="flex justify-end max-w-3xl ml-auto">
      <div className="bg-default rounded-2xl px-4 py-2.5 max-w-[80%]">
        <span className="sr-only">You:</span>
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {textContent}
        </div>
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
