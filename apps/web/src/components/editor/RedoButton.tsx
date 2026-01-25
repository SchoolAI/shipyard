import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react';
import { Redo } from 'lucide-react';
import { getYUndoExtension } from '@/types/blocknote-extensions';

/**
 * Redo button for BlockNote FormattingToolbar.
 * Uses BlockNote's built-in redo functionality.
 */
export function RedoButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();

  if (!Components) {
    throw new Error('RedoButton must be used within BlockNote context');
  }

  return (
    <Components.FormattingToolbar.Button
      mainTooltip="Redo (Cmd+Shift+Z)"
      onClick={() => {
        editor.focus();

        /** Get the yUndo extension (used when collaboration is enabled) */
        const yUndo = getYUndoExtension(editor);
        if (yUndo?.redoCommand) {
          const { state, view } = editor._tiptapEditor;
          yUndo.redoCommand(state, view.dispatch, view);
        }
      }}
    >
      <Redo size={16} />
    </Components.FormattingToolbar.Button>
  );
}
