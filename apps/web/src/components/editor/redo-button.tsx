import { Button, Tooltip } from '@heroui/react';
import type { Editor } from '@tiptap/react';
import { canRedo, redo } from 'loro-prosemirror';
import { Redo } from 'lucide-react';

interface RedoButtonProps {
  editor: Editor;
}

/**
 * Redo button for the task editor toolbar.
 * Uses Loro's redo functionality via loro-prosemirror.
 */
export function RedoButton({ editor }: RedoButtonProps) {
  const isDisabled = !canRedo(editor.state);

  const handleRedo = () => {
    editor.view.focus();
    const { state, dispatch } = editor.view;
    redo(state, dispatch);
  };

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          isDisabled={isDisabled}
          onPress={handleRedo}
          aria-label="Redo"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>Redo (Cmd+Shift+Z)</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
