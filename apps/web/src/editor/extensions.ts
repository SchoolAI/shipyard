import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { CommentMark } from './comment-mark';

export function createExtensions(placeholder: string) {
  return [
    StarterKit,
    Placeholder.configure({
      placeholder,
    }),
    CommentMark,
  ];
}
