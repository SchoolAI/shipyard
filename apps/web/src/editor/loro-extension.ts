import { Extension } from '@tiptap/core';
import type { LoroDoc } from 'loro-crdt';
import { type LoroDocType, LoroSyncPlugin, LoroUndoPlugin, redo, undo } from 'loro-prosemirror';

export function createLoroExtension(loroDoc: LoroDoc) {
  return Extension.create({
    name: 'loro',

    addProseMirrorPlugins() {
      const typedDoc = loroDoc as unknown as LoroDocType;
      const contentMap = loroDoc.getMap('content');
      const containerId = contentMap.id;

      return [
        LoroSyncPlugin({
          doc: typedDoc,
          containerId,
        }),
        LoroUndoPlugin({
          doc: loroDoc,
        }),
      ];
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
