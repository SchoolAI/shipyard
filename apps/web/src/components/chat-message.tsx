import { Avatar, Button, Tooltip } from '@heroui/react';
import { Bot, Check, Copy } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { assertNever } from '../utils/assert-never';

export type MessageRole = 'user' | 'agent';

export interface ChatMessageData {
  id: string;
  role: MessageRole;
  content: string;
  isThinking?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

function ThinkingDots() {
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
          className="absolute top-2 right-2 rounded-md w-7 h-7 min-w-0 text-muted hover:text-foreground hover:bg-default/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 motion-safe:transition-opacity"
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

function AgentMessage({ message }: ChatMessageProps) {
  return (
    <div className="flex items-start gap-3 max-w-3xl">
      <Avatar className="size-7 shrink-0 bg-default mt-0.5">
        <Avatar.Fallback>
          <Bot className="w-4 h-4 text-muted" />
        </Avatar.Fallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <span className="sr-only">Agent:</span>
        {message.isThinking ? (
          <div className="py-2">
            <ThinkingDots />
          </div>
        ) : (
          <div className="text-sm text-foreground/90 leading-relaxed prose-shipyard">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }: ChatMessageProps) {
  return (
    <div className="flex justify-end max-w-3xl ml-auto">
      <div className="bg-default rounded-xl px-4 py-2.5 max-w-[80%]">
        <span className="sr-only">You:</span>
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message} />;
    case 'agent':
      return <AgentMessage message={message} />;
    default:
      return assertNever(message.role);
  }
}
