import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react';
import { Undo } from 'lucide-react';

/**
 * Undo button for BlockNote FormattingToolbar.
 * Uses BlockNote's built-in undo functionality via Tiptap.
 */
export function UndoButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();

  if (!Components) {
    throw new Error('UndoButton must be used within BlockNote context');
  }

  return (
    <Components.FormattingToolbar.Button
      mainTooltip="Undo (Cmd+Z)"
      onClick={() => {
        editor.focus();
        editor._tiptapEditor.commands.undo();
      }}
    >
      <Undo size={16} />
    </Components.FormattingToolbar.Button>
  );
}
