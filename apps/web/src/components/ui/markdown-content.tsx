import { memo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownContentProps {
  content: string;
  variant?: 'default' | 'compact' | 'minimal' | 'toast';
  maxHeight?: string;
  className?: string;
}

function getVariantClasses(variant: MarkdownContentProps['variant']): string {
  switch (variant) {
    case 'compact':
      return 'text-sm [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_pre]:mb-1 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm';
    case 'minimal':
      return 'text-sm [&_p]:inline [&_p]:mb-0';
    case 'toast':
      return 'text-sm [&_p]:mb-0 [&_p]:inline-block [&_ul]:inline [&_ol]:inline [&_li]:inline [&_pre]:hidden [&_h1]:inline [&_h2]:inline [&_h3]:inline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium';
    default:
      return 'text-sm [&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_pre]:mb-3 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm';
  }
}

const markdownComponents: Components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline"
    >
      {children}
    </a>
  ),

  code: (props: { className?: string; children?: React.ReactNode; node?: unknown }) => {
    const { className, children, ...rest } = props;
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-surface px-1.5 py-0.5 rounded text-[0.9em] font-mono" {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className={`${className} font-mono`} {...rest}>
        {children}
      </code>
    );
  },

  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-surface border border-border rounded-md p-3 overflow-x-auto text-[0.9em]">
      {children}
    </pre>
  ),

  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-1 ml-1">{children}</ul>
  ),

  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1 ml-1">{children}</ol>
  ),

  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-foreground">{children}</li>
  ),

  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-foreground leading-relaxed">{children}</p>
  ),

  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="font-semibold text-foreground mb-2 mt-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="font-semibold text-foreground mb-2 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-medium text-foreground mb-1.5 mt-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="font-medium text-foreground mb-1 mt-2 first:mt-0">{children}</h4>
  ),
  h5: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="font-medium text-foreground mb-1 mt-1 first:mt-0">{children}</h5>
  ),
  h6: ({ children }: { children?: React.ReactNode }) => (
    <h6 className="font-medium text-muted-foreground mb-1 mt-1 first:mt-0">{children}</h6>
  ),

  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-accent pl-3 italic text-muted-foreground my-2">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="border-border my-4" />,

  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-surface">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b border-border">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-foreground">{children}</td>
  ),

  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),

  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,

  del: ({ children }: { children?: React.ReactNode }) => (
    <del className="line-through text-muted-foreground">{children}</del>
  ),
};

export const MarkdownContent = memo(function MarkdownContent({
  content,
  variant = 'default',
  maxHeight,
  className = '',
}: MarkdownContentProps) {
  const variantClasses = getVariantClasses(variant);

  const containerStyle = maxHeight ? { maxHeight, overflowY: 'auto' as const } : undefined;

  return (
    <div
      className={`markdown-content ${variantClasses} ${className}`.trim()}
      style={containerStyle}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
