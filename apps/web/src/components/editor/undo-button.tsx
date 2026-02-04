import { Button, Tooltip } from '@heroui/react';
import type { Editor } from '@tiptap/react';
import { canUndo, undo } from 'loro-prosemirror';
import { Undo } from 'lucide-react';

interface UndoButtonProps {
  editor: Editor;
}

/**
 * Undo button for the task editor toolbar.
 * Uses Loro's undo functionality via loro-prosemirror.
 */
export function UndoButton({ editor }: UndoButtonProps) {
  const isDisabled = !canUndo(editor.state);

  const handleUndo = () => {
    editor.view.focus();
    const { state, dispatch } = editor.view;
    undo(state, dispatch);
  };

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          isDisabled={isDisabled}
          onPress={handleUndo}
          aria-label="Undo"
        >
          <Undo className="h-4 w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>Undo (Cmd+Z)</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
