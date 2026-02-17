export { PlanEditor };

import { EditorContent, useEditor } from '@tiptap/react';
import { marked } from 'marked';
import { useEffect, useMemo } from 'react';
import { createExtensions } from '../editor';

const extensions = createExtensions('No plan content');

interface PlanEditorProps {
  markdown: string;
  editable?: boolean;
}

function PlanEditor({ markdown, editable = false }: PlanEditorProps) {
  const html = useMemo(() => {
    const result = marked.parse(markdown, { async: false });
    if (typeof result !== 'string')
      throw new Error('marked.parse returned async result unexpectedly');
    return result;
  }, [markdown]);

  const editor = useEditor({
    extensions,
    content: html,
    editable,
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(html);
    }
  }, [editor, html]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return <EditorContent editor={editor} className="plan-editor" />;
}
