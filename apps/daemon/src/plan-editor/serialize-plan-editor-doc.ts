import { type LoroDoc, LoroList, LoroMap, LoroText } from 'loro-crdt';

const CHILDREN_KEY = 'children';
const ATTRIBUTES_KEY = 'attributes';
const NODE_NAME_KEY = 'nodeName';

interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Read a Loro editor container back as markdown.
 *
 * Reconstructs ProseMirror JSON from the Loro Map/List/Text structure,
 * then serializes it to markdown using node-type-aware rendering.
 * No DOM or TipTap dependencies needed.
 */
export function serializePlanEditorDoc(loroDoc: LoroDoc, planId: string): string {
  const planEditorDocs = loroDoc.getMap('planEditorDocs');
  const raw = planEditorDocs.get(planId);
  if (!(raw instanceof LoroMap)) return '';

  const doc = readLoroNode(raw);
  if (!doc) return '';

  return renderDocToMarkdown(doc);
}

function readLoroNode(map: LoroMap): ProseMirrorNode | null {
  const nodeName = map.get(NODE_NAME_KEY);
  if (typeof nodeName !== 'string') return null;

  const node: ProseMirrorNode = { type: nodeName };
  readAttributes(map, node);
  readChildren(map, node);
  return node;
}

function readAttributes(map: LoroMap, node: ProseMirrorNode): void {
  const attrsContainer = map.get(ATTRIBUTES_KEY);
  if (!(attrsContainer instanceof LoroMap)) return;

  const json = attrsContainer.toJSON() as Record<string, unknown>;
  if (Object.keys(json).length > 0) {
    node.attrs = json;
  }
}

function readChildren(map: LoroMap, node: ProseMirrorNode): void {
  const childrenContainer = map.get(CHILDREN_KEY);
  if (!(childrenContainer instanceof LoroList)) return;

  const content: ProseMirrorNode[] = [];
  for (let i = 0; i < childrenContainer.length; i++) {
    const child = childrenContainer.get(i);
    if (child instanceof LoroMap) {
      const childNode = readLoroNode(child);
      if (childNode) content.push(childNode);
    } else if (child instanceof LoroText) {
      content.push(...readLoroText(child));
    }
  }
  if (content.length > 0) {
    node.content = content;
  }
}

function readLoroText(text: LoroText): ProseMirrorNode[] {
  const delta = text.toDelta();
  const nodes: ProseMirrorNode[] = [];

  for (const d of delta) {
    if (d.insert == null) continue;

    const node: ProseMirrorNode = { type: 'text', text: d.insert };
    if (d.attributes && Object.keys(d.attributes).length > 0) {
      node.marks = Object.entries(d.attributes).map(([name, attrs]) => {
        const mark: { type: string; attrs?: Record<string, unknown> } = { type: name };
        if (attrs != null && typeof attrs === 'object' && Object.keys(attrs).length > 0) {
          mark.attrs = attrs as Record<string, unknown>;
        }
        return mark;
      });
    }
    nodes.push(node);
  }

  return nodes;
}

function renderDocToMarkdown(doc: ProseMirrorNode): string {
  if (!doc.content) return '';
  return doc.content.map((node) => renderBlock(node)).join('\n');
}

function renderBlock(node: ProseMirrorNode): string {
  switch (node.type) {
    case 'paragraph':
      return `${renderInline(node.content)}\n`;
    case 'heading':
      return renderHeadingBlock(node);
    case 'codeBlock':
      return renderCodeBlockBlock(node);
    case 'blockquote':
      return renderBlockquoteBlock(node);
    case 'bulletList':
      return renderList(node, false);
    case 'orderedList':
      return renderList(node, true);
    case 'horizontalRule':
      return '---\n';
    case 'hardBreak':
      return '\n';
    default:
      return `${renderInline(node.content)}\n`;
  }
}

function renderHeadingBlock(node: ProseMirrorNode): string {
  const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
  const prefix = '#'.repeat(level);
  return `${prefix} ${renderInline(node.content)}\n`;
}

function renderCodeBlockBlock(node: ProseMirrorNode): string {
  const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
  const code = renderPlainText(node.content);
  return `\`\`\`${lang}\n${code}\n\`\`\`\n`;
}

function renderBlockquoteBlock(node: ProseMirrorNode): string {
  if (!node.content) return '>\n';
  const inner = node.content.map((child) => renderBlock(child)).join('\n');
  return `${inner
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n`;
}

function renderList(node: ProseMirrorNode, ordered: boolean): string {
  if (!node.content) return '';
  const startNum = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;

  return `${node.content
    .map((item, idx) => {
      const prefix = ordered ? `${startNum + idx}. ` : '- ';
      const itemContent = renderListItemContent(item);
      return `${prefix}${itemContent}`;
    })
    .join('\n')}\n`;
}

function renderListItemContent(item: ProseMirrorNode): string {
  if (!item.content) return '';

  return item.content
    .map((child) => {
      if (child.type === 'paragraph') {
        return renderInline(child.content);
      }
      return renderBlock(child).trimEnd();
    })
    .join('\n');
}

function renderInline(content: ProseMirrorNode[] | undefined): string {
  if (!content) return '';
  return content.map((node) => renderTextNode(node)).join('');
}

function renderTextNode(node: ProseMirrorNode): string {
  if (node.type !== 'text' || !node.text) return '';

  let text = node.text;

  if (!node.marks || node.marks.length === 0) return text;

  const markTypes = new Set(node.marks.map((m) => m.type));

  if (markTypes.has('code')) return `\`${text}\``;
  if (markTypes.has('bold') && markTypes.has('italic')) text = `***${text}***`;
  else if (markTypes.has('bold')) text = `**${text}**`;
  else if (markTypes.has('italic')) text = `*${text}*`;
  if (markTypes.has('strike')) text = `~~${text}~~`;

  return text;
}

function renderPlainText(content: ProseMirrorNode[] | undefined): string {
  if (!content) return '';
  return content.map((n) => n.text ?? '').join('');
}
