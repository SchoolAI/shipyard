export { configurePlanEditorTextStyles, planEditorParser, planEditorSchema, planEditorSerializer };

import { getSchema, Mark } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import type { LoroDoc } from 'loro-crdt';
import MarkdownIt from 'markdown-it';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';

/**
 * Minimal CommentMark matching apps/web/src/editor/comment-mark.ts.
 * Only the mark name + attributes matter for schema generation;
 * editor commands (setComment/unsetComment) are not needed server-side.
 */
const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return { commentId: { default: null } };
  },
});

/**
 * ProseMirror schema matching the web app's TipTap editor.
 *
 * Uses the same extensions as createExtensions() in apps/web/src/editor/extensions.ts
 * minus Placeholder (UI-only, zero schema contribution).
 */
const planEditorSchema = getSchema([StarterKit.configure({ undoRedo: false }), CommentMark]);

/**
 * Configure Loro text styles for the plan editor schema.
 *
 * Must be called once per LoroDoc before updateLoroToPmState writes rich text.
 * Replicates what LoroSyncPlugin does internally via configLoroTextStyle().
 */
type ExpandDirection = 'after' | 'before' | 'both' | 'none';
const configuredDocs = new WeakSet<object>();
function configurePlanEditorTextStyles(loroDoc: LoroDoc): void {
  if (configuredDocs.has(loroDoc)) return;
  configuredDocs.add(loroDoc);
  const config: Record<string, { expand: ExpandDirection }> = {};
  for (const [name, markType] of Object.entries(planEditorSchema.marks)) {
    const expand: ExpandDirection = markType.spec.inclusive !== false ? 'after' : 'none';
    config[name] = { expand };
  }
  loroDoc.configTextStyle(config);
}

/**
 * MarkdownParser with TipTap camelCase node/mark name mappings.
 *
 * prosemirror-markdown defaults use snake_case (code_block, bullet_list, etc.)
 * but TipTap StarterKit registers camelCase names (codeBlock, bulletList, etc.).
 */
const planEditorParser = new MarkdownParser(
  planEditorSchema,
  MarkdownIt('commonmark', { html: false }).enable('strikethrough').disable('image'),
  {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'listItem' },
    bullet_list: { block: 'bulletList' },
    ordered_list: {
      block: 'orderedList',
      getAttrs: (tok) => ({ start: Number(tok.attrGet('start') ?? 1) }),
    },
    heading: {
      block: 'heading',
      getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }),
    },
    code_block: { block: 'codeBlock', noCloseToken: true },
    fence: {
      block: 'codeBlock',
      getAttrs: (tok) => ({ language: tok.info || null }),
      noCloseToken: true,
    },
    hr: { node: 'horizontalRule' },
    hardbreak: { node: 'hardBreak' },
    link: {
      mark: 'link',
      getAttrs: (tok) => ({ href: tok.attrGet('href'), target: tok.attrGet('target') }),
    },
    em: { mark: 'italic' },
    strong: { mark: 'bold' },
    code_inline: { mark: 'code', noCloseToken: true },
    s: { mark: 'strike' },
  }
);

function backticksFor(node: Node, side: number): string {
  const ticks = /`+/g;
  let len = 0;
  if (node.isText && node.text) {
    for (const match of node.text.matchAll(ticks)) {
      len = Math.max(len, match[0].length);
    }
  }
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}

/**
 * MarkdownSerializer with TipTap camelCase node/mark name handlers.
 *
 * strict: false so unknown marks (comment, underline) are silently ignored.
 */
const planEditorSerializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    codeBlock(state, node) {
      const info = String(node.attrs.language ?? '');
      state.write(`\`\`\`${info}\n`);
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${state.repeat('#', Number(node.attrs.level))} `);
      state.renderInline(node);
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write('---');
      state.closeBlock(node);
    },
    bulletList(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    orderedList(state, node) {
      const start = Number(node.attrs.start) || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxW + 2);
      state.renderList(node, space, (i) => {
        const nStr = String(start + i);
        return `${state.repeat(' ', maxW - nStr.length)}${nStr}. `;
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n');
          return;
        }
      }
    },
    text(state, node) {
      state.text(node.text ?? '');
    },
  },
  {
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    code: {
      open(_state, _mark, parent, index) {
        return backticksFor(parent.child(index), -1);
      },
      close(_state, _mark, parent, index) {
        return backticksFor(parent.child(index - 1), 1);
      },
      escape: false,
    },
    link: {
      open: '[',
      close(_state, mark) {
        const href = String(mark.attrs.href ?? '');
        const title = mark.attrs.title ? ` "${String(mark.attrs.title)}"` : '';
        return `](${href}${title})`;
      },
    },
    comment: { open: '', close: '' },
  },
  { hardBreakNodeName: 'hardBreak', strict: false }
);
