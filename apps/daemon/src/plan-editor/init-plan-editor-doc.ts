export { initPlanEditorDoc };

import { EditorState } from '@tiptap/pm/state';
import type { LoroDoc } from 'loro-crdt';
import { LoroMap } from 'loro-crdt';
import type { LoroDocType, LoroNodeMapping } from 'loro-prosemirror';
import { updateLoroToPmState } from 'loro-prosemirror';
import { logger } from '../logger.js';
import { configurePlanEditorTextStyles, planEditorParser, planEditorSchema } from './schema.js';

/**
 * Initialize a plan editor Loro container from markdown.
 *
 * Pipeline: markdown -> prosemirror-markdown parser -> ProseMirror Node
 * -> updateLoroToPmState -> Loro containers (identical to LoroSyncPlugin format)
 *
 * Returns false if parsing/init fails (e.g., unsupported markdown token types),
 * allowing callers to continue processing remaining plans.
 */
function initPlanEditorDoc(loroDoc: LoroDoc, planId: string, markdown: string): boolean {
  try {
    const pmDoc = planEditorParser.parse(markdown);

    const planEditorDocs = loroDoc.getMap('planEditorDocs');
    const planContainer = planEditorDocs.setContainer(planId, new LoroMap());

    configurePlanEditorTextStyles(loroDoc);
    const editorState = EditorState.create({ doc: pmDoc, schema: planEditorSchema });
    const mapping: LoroNodeMapping = new Map();

    // eslint-disable-next-line no-restricted-syntax -- loro-prosemirror requires LoroDocType which is structurally identical to LoroDoc but nominally distinct
    updateLoroToPmState(loroDoc as unknown as LoroDocType, mapping, editorState, planContainer.id);
    loroDoc.commit();
    return true;
  } catch (error) {
    logger.warn({ planId, error }, 'initPlanEditorDoc failed');
    return false;
  }
}
