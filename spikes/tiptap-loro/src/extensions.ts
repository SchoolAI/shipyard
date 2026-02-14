import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { CommentMark } from './comment-mark';

/**
 * Tiptap extensions bundle for the spike.
 *
 * StarterKit in Tiptap 3.x includes: Document, Paragraph, Text, Bold, Italic, Strike,
 * Code, Heading, Blockquote, BulletList, OrderedList, ListItem,
 * CodeBlock, HorizontalRule, HardBreak, Dropcursor, Gapcursor
 *
 * NOTE: History is NOT included in Tiptap 3.x StarterKit by default.
 * loro-prosemirror provides its own undo/redo via LoroUndoPlugin.
 */
export function createExtensions(placeholder: string) {
  return [
    StarterKit,
    Placeholder.configure({
      placeholder,
    }),
    CommentMark,
  ];
}
