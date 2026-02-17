import { Extension } from '@tiptap/core';
import type { ContainerID, LoroDoc } from 'loro-crdt';
import { type LoroDocType, LoroSyncPlugin, LoroUndoPlugin, redo, undo } from 'loro-prosemirror';

export function createLoroSyncExtension(loroDoc: LoroDoc, containerId: ContainerID) {
  return Extension.create({
    name: 'loroSync',

    addProseMirrorPlugins() {
      // eslint-disable-next-line no-restricted-syntax -- loro-prosemirror requires LoroDocType which is structurally identical to LoroDoc but nominally distinct
      const typedDoc = loroDoc as unknown as LoroDocType;

      return [LoroSyncPlugin({ doc: typedDoc, containerId }), LoroUndoPlugin({ doc: loroDoc })];
    },

    addKeyboardShortcuts() {
      return {
        'Mod-z': () => {
          const { state, dispatch } = this.editor.view;
          return undo(state, dispatch);
        },
        'Mod-y': () => {
          const { state, dispatch } = this.editor.view;
          return redo(state, dispatch);
        },
        'Mod-Shift-z': () => {
          const { state, dispatch } = this.editor.view;
          return redo(state, dispatch);
        },
      };
    },
  });
}
