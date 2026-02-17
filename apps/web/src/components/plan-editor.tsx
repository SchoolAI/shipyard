export { PlanEditor };

import { EditorContent, useEditor } from '@tiptap/react';
import { marked } from 'marked';
import { useMemo } from 'react';
import { createExtensions } from '../editor';

interface PlanEditorProps {
  markdown: string;
  editable?: boolean;
}

function PlanEditor({ markdown, editable = false }: PlanEditorProps) {
  const html = useMemo(() => String(marked.parse(markdown, { async: false })), [markdown]);

  const editor = useEditor(
    {
      extensions: createExtensions('No plan content'),
      content: html,
      editable,
    },
    [html, editable]
  );

  return <EditorContent editor={editor} className="plan-editor" />;
}
