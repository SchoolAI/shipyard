import type { TaskId } from '@shipyard/loro-schema';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { AddCommentToolbarButton, RedoButton, UndoButton } from '@/components/editor';
import { useTaskHandle } from '@/loro/selectors/task-selectors';
import { createExtensions } from './extensions';
import { createLoroExtension } from './loro-extension';

interface TaskEditorProps {
  taskId: TaskId;
  readOnly?: boolean;
  placeholder?: string;
  /** Callback when user clicks add comment button */
  onAddComment?: (blockId: string, selectedText: string) => void;
}

export function TaskEditor({
  taskId,
  readOnly = false,
  placeholder = 'Start writing...',
  onAddComment,
}: TaskEditorProps) {
  const handle = useTaskHandle(taskId);
  const loroDoc = handle.loroDoc;

  const editor = useEditor(
    {
      extensions: [...createExtensions(placeholder), createLoroExtension(loroDoc)],
      content: '',
      editable: !readOnly,
    },
    [loroDoc]
  );

  if (!editor) {
    return null;
  }

  return (
    <div className="relative">
      {!readOnly && (
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-1 rounded-md border border-border bg-surface/95 p-1 backdrop-blur-sm">
          <UndoButton editor={editor} />
          <RedoButton editor={editor} />
          <div className="mx-1 h-4 w-px bg-border" />
          <AddCommentToolbarButton editor={editor} onAddComment={onAddComment} />
        </div>
      )}
      <DragHandle editor={editor}>
        <div className="flex h-6 w-6 cursor-grab items-center justify-center rounded border border-border bg-surface text-muted-foreground hover:bg-muted active:cursor-grabbing">
          ⠿
        </div>
      </DragHandle>
      <EditorContent editor={editor} className="prose max-w-none" />
    </div>
  );
}
