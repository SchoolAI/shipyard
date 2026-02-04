import { Button, Tooltip } from '@heroui/react';
import type { Editor } from '@tiptap/react';
import { MessageSquarePlus } from 'lucide-react';
import { useCallback } from 'react';

interface AddCommentToolbarButtonProps {
  editor: Editor;
  /** Callback when add comment is clicked with block ID and selected text */
  onAddComment?: (blockId: string, selectedText: string) => void;
}

/**
 * Get a unique block ID for the current cursor position.
 *
 * This uses the ProseMirror node position to create a stable identifier.
 * The ID format is: `block-{startPosition}-{nodeSize}`
 *
 * In the future, this could be enhanced to use Loro's ContainerID
 * for true CRDT-stable identifiers.
 */
function getBlockIdAtSelection(editor: Editor): string {
  const { state } = editor;
  const { selection } = state;

  // Resolve the position to find the parent block
  const $pos = selection.$anchor;

  // Walk up to find the nearest block node
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.isBlock && !node.isTextblock) {
      // Found a block-level container (like doc, or custom blocks)
      const start = $pos.start(depth);
      return `block-${start}-${node.nodeSize}`;
    }
    if (node.isTextblock) {
      // Found a textblock (paragraph, heading, etc.)
      const start = $pos.start(depth);
      return `block-${start}-${node.nodeSize}`;
    }
  }

  // Fallback: use the root document position
  return `block-root-${Date.now()}`;
}

/**
 * Get the currently selected text from the editor.
 */
function getSelectedText(editor: Editor): string {
  const { state } = editor;
  const { selection } = state;
  const { from, to } = selection;

  if (from === to) {
    return '';
  }

  return state.doc.textBetween(from, to, ' ');
}

/**
 * Add Comment button for the task editor toolbar.
 *
 * When clicked, gets the current block ID and selected text,
 * then calls the onAddComment callback to open the composer.
 */
export function AddCommentToolbarButton({ editor, onAddComment }: AddCommentToolbarButtonProps) {
  const handleClick = useCallback(() => {
    if (!onAddComment) return;

    const blockId = getBlockIdAtSelection(editor);
    const selectedText = getSelectedText(editor);

    onAddComment(blockId, selectedText);
  }, [editor, onAddComment]);

  // Only show button when callback is provided (user is authenticated)
  if (!onAddComment) {
    return null;
  }

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button isIconOnly variant="ghost" size="sm" onPress={handleClick} aria-label="Add Comment">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>Add Comment (Cmd+Shift+C)</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
