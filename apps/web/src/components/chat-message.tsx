import { Button, Chip, Tooltip } from '@heroui/react';
import type { ContentBlock } from '@shipyard/loro-schema';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileEdit,
  FileSearch,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { assertNever } from '../utils/assert-never';
import { summarizeToolAction, TOOL_ICON_LABELS } from '../utils/tool-summarizers';
import { ClaudeIcon, GeminiIcon, OpenAIIcon } from './agent-icons';
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
      <div className="group relative my-3">
        <pre
          className="bg-[var(--color-code-block)] rounded-lg p-4 overflow-x-auto text-sm leading-relaxed border border-separator/50"
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
      <li className="leading-relaxed" {...rest}>
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
      <div className="overflow-x-auto my-3">
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
    return <hr className="border-separator my-3" {...rest} />;
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

/* ---------- Tool icon resolution ---------- */

const TOOL_ICONS: Record<string, ReactNode> = {
  Bash: <SquareTerminal className="w-3 h-3" aria-hidden="true" />,
  Edit: <FileEdit className="w-3 h-3" aria-hidden="true" />,
  Write: <FileEdit className="w-3 h-3" aria-hidden="true" />,
  Read: <FileSearch className="w-3 h-3" aria-hidden="true" />,
  Glob: <Search className="w-3 h-3" aria-hidden="true" />,
  Grep: <Search className="w-3 h-3" aria-hidden="true" />,
};

function toolIcon(toolName: string): ReactNode {
  return TOOL_ICONS[toolName] ?? <Wrench className="w-3 h-3" aria-hidden="true" />;
}

/* ---------- Collapsible detail helper ---------- */

const LONG_CONTENT_THRESHOLD = 1000;
const LONG_CONTENT_LINE_THRESHOLD = 15;

function isLongContent(text: string): boolean {
  return (
    text.length > LONG_CONTENT_THRESHOLD || text.split('\n').length > LONG_CONTENT_LINE_THRESHOLD
  );
}

/* ---------- ToolUseCard ---------- */

interface ToolUseCardProps {
  toolName: string;
  input: string;
}

function ToolUseCard({ toolName, input }: ToolUseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();
  const summary = summarizeToolAction(toolName, input);
  const iconLabel = TOOL_ICON_LABELS[toolName] ?? toolName;

  let formattedInput = input;
  try {
    formattedInput = JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    /* raw string is fine */
  }

  return (
    <div className="rounded-lg border border-separator/60 bg-surface/50 px-3 py-2">
      {/* Summary row */}
      <div className="flex items-center gap-2 min-w-0">
        <Chip
          size="sm"
          variant="soft"
          className="shrink-0 gap-1 text-muted bg-default/50 h-5 text-[0.6875rem]"
          aria-label={iconLabel}
        >
          {toolIcon(toolName)}
          {toolName}
        </Chip>
        <span className="text-xs text-foreground/70 font-mono truncate min-w-0" title={summary}>
          {summary}
        </span>
      </div>

      {/* Expandable detail */}
      <div className="mt-1.5">
        <button
          type="button"
          className="flex items-center gap-1 text-[0.6875rem] text-muted hover:text-foreground transition-colors"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
          {isExpanded ? 'Hide input' : 'Show input'}
        </button>
        {isExpanded && (
          <pre
            id={panelId}
            className="mt-1.5 p-2.5 rounded-md bg-background text-[0.6875rem] text-foreground/70 font-mono overflow-x-auto max-h-48 border border-separator/40"
          >
            {formattedInput}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ---------- ToolResultCard ---------- */

interface ToolResultCardProps {
  content: string;
  isError: boolean;
}

function ToolResultCard({ content, isError }: ToolResultCardProps) {
  const isLong = isLongContent(content);
  const [isExpanded, setIsExpanded] = useState(!isLong);
  const panelId = useId();

  const borderClass = isError ? 'border-danger/40' : 'border-separator/40';
  const bgClass = isError ? 'bg-danger/5' : 'bg-surface/30';
  const iconClass = isError ? 'text-danger' : 'text-success';
  const labelText = isError ? 'Error' : 'Result';

  /** Detect whether the content looks like JSON */
  let isJson = false;
  try {
    JSON.parse(content);
    isJson = true;
  } catch {
    /* not JSON */
  }

  const isCollapsedPreview = isLong && !isExpanded;

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} px-3 py-2`}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1">
        {isError ? (
          <AlertCircle className={`w-3 h-3 ${iconClass}`} aria-hidden="true" />
        ) : (
          <CheckCircle2 className={`w-3 h-3 ${iconClass}`} aria-hidden="true" />
        )}
        <span className={`text-[0.6875rem] font-medium ${iconClass}`}>{labelText}</span>
      </div>

      {/* Content */}
      <div id={panelId}>
        {isCollapsedPreview ? (
          <pre className="text-[0.6875rem] text-foreground/70 font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
            {content.slice(0, 200)}...
          </pre>
        ) : isJson ? (
          <pre className="text-[0.6875rem] text-foreground/70 font-mono overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
            {content}
          </pre>
        ) : (
          <div className="text-[0.6875rem] text-foreground/70 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Expand/collapse for long content */}
      {isLong && (
        <button
          type="button"
          className="flex items-center gap-1 mt-1.5 text-[0.6875rem] text-muted hover:text-foreground transition-colors"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          {isExpanded ? (
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          )}
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

/* ---------- ContentBlockRenderer ---------- */

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={markdownComponents}
        >
          {block.text}
        </ReactMarkdown>
      );
    case 'tool_use':
      return <ToolUseCard toolName={block.toolName} input={block.input} />;
    case 'tool_result':
      return <ToolResultCard content={block.content} isError={block.isError} />;
    case 'thinking':
      return null;
    default:
      return assertNever(block);
  }
}

/* ---------- Agent avatar resolution ---------- */

interface AgentAvatarConfig {
  icon: ReactNode;
  label: string;
  bgClass: string;
}

function resolveAgentAvatar(agentName?: string): AgentAvatarConfig {
  const name = agentName?.toLowerCase() ?? '';

  if (name.includes('claude') || name.includes('anthropic')) {
    return {
      icon: <ClaudeIcon className="w-3.5 h-3.5 text-agent-claude-fg" />,
      label: 'Claude',
      bgClass: 'bg-agent-claude-bg',
    };
  }

  if (
    name.includes('gpt') ||
    name.includes('codex') ||
    name.includes('openai') ||
    name === 'o1' ||
    name.includes('o1-') ||
    name === 'o3' ||
    name.includes('o3-')
  ) {
    return {
      icon: <OpenAIIcon className="w-3.5 h-3.5 text-agent-openai-fg" />,
      label: 'OpenAI',
      bgClass: 'bg-agent-openai-bg',
    };
  }

  if (name.includes('gemini') || name.includes('google')) {
    return {
      icon: <GeminiIcon className="w-3.5 h-3.5 text-agent-gemini-fg" />,
      label: 'Gemini',
      bgClass: 'bg-agent-gemini-bg',
    };
  }

  return {
    icon: <Bot className="w-3.5 h-3.5 text-muted" />,
    label: 'Agent',
    bgClass: 'bg-default',
  };
}

/* ---------- Message components ---------- */

function AgentMessage({ message }: ChatMessageProps) {
  const avatar = resolveAgentAvatar(message.agentName);

  /** If every content block is a thinking block, there is nothing visible to render. */
  const hasVisibleContent =
    message.isThinking || message.content.some((b) => b.type !== 'thinking');
  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 max-w-3xl">
      <div
        className={`size-7 shrink-0 mt-0.5 rounded-full flex items-center justify-center ${avatar.bgClass}`}
      >
        {avatar.icon}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-muted mb-1 block">{avatar.label}</span>
        {message.isThinking ? (
          <div className="py-1">
            <AsciiShipThinking />
          </div>
        ) : (
          <div className="text-sm text-foreground/90 leading-relaxed prose-shipyard space-y-2">
            {message.content.map((block, i) => (
              <ContentBlockRenderer key={`${block.type}-${i}`} block={block} />
            ))}
          </div>
        )}
      </div>
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
