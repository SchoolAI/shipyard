import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { LoroSyncPlugin, LoroUndoPlugin, undo, redo, type LoroDocType } from 'loro-prosemirror';
import type { LoroDoc } from 'loro-crdt';
import { useEffect, useState, useCallback } from 'react';
import { createExtensions } from './extensions';

interface EditorProps {
  name: string;
  loroDoc: LoroDoc;
  color: string;
}

function createLoroExtension(loroDoc: LoroDoc) {
  return Extension.create({
    name: 'loro',

    addProseMirrorPlugins() {
      const typedDoc = loroDoc as unknown as LoroDocType;
      const rootMap = loroDoc.getMap('doc');
      const containerId = rootMap.id;

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

export function Editor({ name, loroDoc, color }: EditorProps) {
  const [status, setStatus] = useState<string>('Initializing...');
  const [docVersion, setDocVersion] = useState<number>(0);

  const editor = useEditor(
    {
      extensions: [...createExtensions(`Start typing in ${name}...`), createLoroExtension(loroDoc)],
      content: '',
      onUpdate: ({ editor }) => {
        const text = editor.getText();
        console.log(`[${name}] Document updated, chars: ${text.length}`);
      },
    },
    [loroDoc]
  );

  useEffect(() => {
    const unsubscribe = loroDoc.subscribe((event) => {
      const version = loroDoc.version().toJSON();
      const versionNum = Object.values(version).reduce((a, b) => a + b, 0);
      setDocVersion(versionNum);

      if (event.by === 'local') {
        setStatus(`Local edit (v${versionNum})`);
      } else if (event.by === 'import') {
        setStatus(`Synced from peer (v${versionNum})`);
      } else {
        setStatus(`${event.by} (v${versionNum})`);
      }
    });

    return () => unsubscribe();
  }, [loroDoc, name]);

  const applyComment = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      console.log(`[${name}] No selection - select text first`);
      return;
    }
    const commentId = `comment-${Date.now()}`;
    console.log(`[${name}] Applying comment mark:`, commentId);
    editor.chain().focus().setComment(commentId).run();
  }, [editor, name]);

  return (
    <div className="editor-wrapper" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
      <div className="editor-label" style={{ color }}>
        {name}
      </div>
      <div className="editor-container">
        {editor && (
          <DragHandle editor={editor}>
            <div className="drag-handle" title="Drag to reorder">
              ⠿
            </div>
          </DragHandle>
        )}
        <EditorContent editor={editor} />
      </div>
      <div className="status-bar">
        Status: {status} | Version: {docVersion}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={applyComment} style={{ fontSize: 12 }}>
          Apply Comment (Mod+Shift+C)
        </button>
      </div>
    </div>
  );
}
