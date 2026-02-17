import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { CommentMark } from './comment-mark';

export function createExtensions(placeholder: string, options?: { loroSync?: boolean }) {
  return [
    StarterKit.configure({ undoRedo: options?.loroSync ? false : undefined }),
    Placeholder.configure({ placeholder }),
    CommentMark,
  ];
}
