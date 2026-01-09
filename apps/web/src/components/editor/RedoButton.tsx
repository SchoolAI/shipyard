import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react';
import { Redo } from 'lucide-react';

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
        editor._tiptapEditor.commands.redo();
      }}
    >
      <Redo size={16} />
    </Components.FormattingToolbar.Button>
  );
}
