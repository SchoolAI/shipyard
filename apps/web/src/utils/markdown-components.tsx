export { markdownComponents, REMARK_PLUGINS, REHYPE_PLUGINS };

import type { ComponentPropsWithoutRef } from 'react';
import type ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

type MarkdownComponents = ComponentPropsWithoutRef<typeof ReactMarkdown>['components'];

const markdownComponents: MarkdownComponents = {
  pre({ children, node: _, ...rest }) {
    return (
      <pre
        className="bg-[var(--color-code-block)] rounded-md p-3 overflow-x-auto text-sm leading-snug border border-separator/30 my-2"
        {...rest}
      >
        {children}
      </pre>
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
