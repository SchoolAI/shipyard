import { type Delta, type LoroDoc, LoroList, LoroMap, LoroText, type Value } from 'loro-crdt';
import { lexer, type Token, type Tokens } from 'marked';

const NODE = {
  doc: 'doc',
  paragraph: 'paragraph',
  heading: 'heading',
  codeBlock: 'codeBlock',
  blockquote: 'blockquote',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
  listItem: 'listItem',
  horizontalRule: 'horizontalRule',
  hardBreak: 'hardBreak',
} as const;

const CHILDREN_KEY = 'children';
const ATTRIBUTES_KEY = 'attributes';
const NODE_NAME_KEY = 'nodeName';

interface TextRun {
  text: string;
  marks: Record<string, Value>;
}

/**
 * Initialize a plan editor Loro container from markdown.
 *
 * Converts markdown to marked tokens (no DOM needed), then writes
 * the ProseMirror node tree into Loro containers matching the structure
 * that loro-prosemirror's LoroSyncPlugin expects:
 *
 *   LoroMap { nodeName, attributes: LoroMap, children: LoroList }
 *
 * Text nodes are LoroText with rich-text delta attributes for marks.
 */
export function initPlanEditorDoc(loroDoc: LoroDoc, planId: string, markdown: string): void {
  const tokens = lexer(markdown);

  const planEditorDocs = loroDoc.getMap('planEditorDocs');
  const planContainer = planEditorDocs.setContainer(planId, new LoroMap());

  planContainer.set(NODE_NAME_KEY, NODE.doc);
  planContainer.setContainer(ATTRIBUTES_KEY, new LoroMap());
  const children = planContainer.setContainer(CHILDREN_KEY, new LoroList());

  for (const token of tokens) {
    writeBlockToken(children, token);
  }

  loroDoc.commit({ origin: 'sys:init' });
}

/* eslint-disable no-restricted-syntax -- marked Token union includes Tokens.Generic; switch narrows `type` but TS still requires casts to access subtype-specific fields */
function writeBlockToken(parentList: LoroList, token: Token): void {
  switch (token.type) {
    case 'paragraph':
      writeParagraph(parentList, token as Tokens.Paragraph);
      break;
    case 'heading':
      writeHeading(parentList, token as Tokens.Heading);
      break;
    case 'code':
      writeCodeBlock(parentList, token as Tokens.Code);
      break;
    case 'blockquote':
      writeBlockquote(parentList, token as Tokens.Blockquote);
      break;
    case 'list':
      writeList(parentList, token as Tokens.List);
      break;
    case 'hr':
      writeLeafNode(parentList, NODE.horizontalRule);
      break;
    case 'space':
      break;
    default:
      break;
  }
}
/* eslint-enable no-restricted-syntax */

function writeParagraph(parentList: LoroList, token: Tokens.Paragraph): void {
  const nodeMap = insertNodeMap(parentList, NODE.paragraph);
  const children = nodeMap.setContainer(CHILDREN_KEY, new LoroList());
  writeInlineTokens(children, token.tokens ?? []);
}

function writeHeading(parentList: LoroList, token: Tokens.Heading): void {
  const nodeMap = insertNodeMap(parentList, NODE.heading);
  const attrs = nodeMap.setContainer(ATTRIBUTES_KEY, new LoroMap());
  attrs.set('level', token.depth);
  const children = nodeMap.setContainer(CHILDREN_KEY, new LoroList());
  writeInlineTokens(children, token.tokens ?? []);
}

function writeCodeBlock(parentList: LoroList, token: Tokens.Code): void {
  const nodeMap = insertNodeMap(parentList, NODE.codeBlock);
  if (token.lang) {
    const attrs = nodeMap.setContainer(ATTRIBUTES_KEY, new LoroMap());
    attrs.set('language', token.lang);
  }
  const children = nodeMap.setContainer(CHILDREN_KEY, new LoroList());
  const text = insertLoroText(children);
  text.insert(0, token.text);
}

function writeBlockquote(parentList: LoroList, token: Tokens.Blockquote): void {
  const nodeMap = insertNodeMap(parentList, NODE.blockquote);
  const children = nodeMap.setContainer(CHILDREN_KEY, new LoroList());
  for (const child of token.tokens) {
    writeBlockToken(children, child);
  }
}

function writeList(parentList: LoroList, token: Tokens.List): void {
  const nodeName = token.ordered ? NODE.orderedList : NODE.bulletList;
  const nodeMap = insertNodeMap(parentList, nodeName);
  if (token.ordered && token.start !== '' && token.start !== 1) {
    const attrs = nodeMap.setContainer(ATTRIBUTES_KEY, new LoroMap());
    attrs.set('start', token.start);
  }
  const children = nodeMap.setContainer(CHILDREN_KEY, new LoroList());
  for (const item of token.items) {
    writeListItem(children, item);
  }
}

function writeListItem(parentList: LoroList, token: Tokens.ListItem): void {
  const nodeMap = insertNodeMap(parentList, NODE.listItem);
  const children = nodeMap.setContainer(CHILDREN_KEY, new LoroList());

  for (const child of token.tokens) {
    if (child.type === 'text' && 'tokens' in child && child.tokens) {
      const para = insertNodeMap(children, NODE.paragraph);
      const paraChildren = para.setContainer(CHILDREN_KEY, new LoroList());
      writeInlineTokens(paraChildren, child.tokens);
    } else {
      writeBlockToken(children, child);
    }
  }
}

/**
 * Flatten inline tokens into text runs with accumulated marks,
 * then write them as a single LoroText with delta attributes.
 */
function writeInlineTokens(childrenList: LoroList, tokens: Token[]): void {
  const runs = flattenInlineTokens(tokens, {});
  if (runs.length === 0) return;

  const loroText = insertLoroText(childrenList);

  const delta: Delta<string>[] = runs.map((run) => {
    const hasMarks = Object.keys(run.marks).length > 0;
    return {
      insert: run.text,
      attributes: hasMarks ? run.marks : undefined,
    };
  });

  loroText.applyDelta(delta);
}

/** NOTE: loro-crdt Value is a broad union; empty object represents mark-present-with-defaults */
// eslint-disable-next-line no-restricted-syntax -- Value union does not include plain objects; cast is required
const MARK_PRESENT: Value = {} as Value;

function flattenInlineTokens(tokens: Token[], inheritedMarks: Record<string, Value>): TextRun[] {
  const runs: TextRun[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        // eslint-disable-next-line no-restricted-syntax -- marked Token union includes Tokens.Generic; switch does not narrow
        const textToken = token as Tokens.Text;
        if (textToken.tokens && textToken.tokens.length > 0) {
          runs.push(...flattenInlineTokens(textToken.tokens, inheritedMarks));
        } else {
          runs.push({ text: textToken.text, marks: { ...inheritedMarks } });
        }
        break;
      }
      case 'strong': {
        // eslint-disable-next-line no-restricted-syntax -- marked Token union includes Tokens.Generic; switch does not narrow
        const strongToken = token as Tokens.Strong;
        const marks = { ...inheritedMarks, bold: MARK_PRESENT };
        runs.push(...flattenInlineTokens(strongToken.tokens, marks));
        break;
      }
      case 'em': {
        // eslint-disable-next-line no-restricted-syntax -- marked Token union includes Tokens.Generic; switch does not narrow
        const emToken = token as Tokens.Em;
        const marks = { ...inheritedMarks, italic: MARK_PRESENT };
        runs.push(...flattenInlineTokens(emToken.tokens, marks));
        break;
      }
      case 'codespan': {
        // eslint-disable-next-line no-restricted-syntax -- marked Token union includes Tokens.Generic; switch does not narrow
        const codeToken = token as Tokens.Codespan;
        runs.push({
          text: codeToken.text,
          marks: { ...inheritedMarks, code: MARK_PRESENT },
        });
        break;
      }
      case 'del': {
        // eslint-disable-next-line no-restricted-syntax -- marked Token union includes Tokens.Generic; switch does not narrow
        const delToken = token as Tokens.Del;
        const marks = { ...inheritedMarks, strike: MARK_PRESENT };
        runs.push(...flattenInlineTokens(delToken.tokens, marks));
        break;
      }
      case 'br': {
        runs.push({ text: '\n', marks: { ...inheritedMarks } });
        break;
      }
      case 'escape': {
        // eslint-disable-next-line no-restricted-syntax -- marked Token union includes Tokens.Generic; switch does not narrow
        const escToken = token as Tokens.Escape;
        runs.push({ text: escToken.text, marks: { ...inheritedMarks } });
        break;
      }
      default: {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          runs.push(...flattenInlineTokens(token.tokens, inheritedMarks));
        } else if ('text' in token && typeof token.text === 'string') {
          runs.push({ text: token.text, marks: { ...inheritedMarks } });
        }
        break;
      }
    }
  }

  return runs;
}

/**
 * `insertContainer` returns a detached container; `getAttached` retrieves
 * the attached version after the doc absorbs it. For containers just
 * created inside a committed doc this always succeeds.
 */
function insertLoroText(parentList: LoroList): LoroText {
  const detached = parentList.insertContainer(parentList.length, new LoroText());
  const attached = detached.getAttached();
  if (!attached) throw new Error('LoroText failed to attach');
  return attached;
}

function insertNodeMap(parentList: LoroList, nodeName: string): LoroMap {
  const detached = parentList.insertContainer(parentList.length, new LoroMap());
  const attached = detached.getAttached();
  if (!attached) throw new Error('LoroMap failed to attach');
  attached.set(NODE_NAME_KEY, nodeName);
  return attached;
}

function writeLeafNode(parentList: LoroList, nodeName: string): void {
  insertNodeMap(parentList, nodeName);
}
