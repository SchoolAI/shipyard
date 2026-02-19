export { serializePlanEditorDoc };

import type { Node } from '@tiptap/pm/model';
import type { LoroDoc } from 'loro-crdt';
import { LoroMap } from 'loro-crdt';
import type { LoroNode, LoroNodeMapping } from 'loro-prosemirror';
import { createNodeFromLoroObj } from 'loro-prosemirror';
import { planEditorSchema, planEditorSerializer } from './schema.js';

function tryCreateNode(raw: LoroMap, mapping: LoroNodeMapping): Node | null {
  try {
    // eslint-disable-next-line no-restricted-syntax -- LoroMap narrowed by caller, LoroNode is structurally compatible
    return createNodeFromLoroObj(planEditorSchema, raw as LoroNode, mapping);
  } catch {
    return null;
  }
}

/**
 * Read a Loro editor container back as markdown.
 *
 * Pipeline: Loro containers -> createNodeFromLoroObj -> ProseMirror Node
 * -> prosemirror-markdown serializer -> markdown string
 */
function serializePlanEditorDoc(loroDoc: LoroDoc, planId: string): string {
  const planEditorDocs = loroDoc.getMap('planEditorDocs');
  const raw = planEditorDocs.get(planId);
  if (!(raw instanceof LoroMap)) return '';

  const mapping: LoroNodeMapping = new Map();
  const pmNode = tryCreateNode(raw, mapping);
  if (!pmNode) return '';

  if (
    pmNode.childCount === 0 ||
    (pmNode.childCount === 1 && pmNode.firstChild?.textContent === '')
  ) {
    return '';
  }

  return planEditorSerializer.serialize(pmNode, { tightLists: true });
}
