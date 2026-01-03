import type { Block } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type * as Y from 'yjs';

interface PlanViewerFallback {
  content: Block[];
}

interface PlanViewerProps {
  ydoc: Y.Doc;
  fallback: PlanViewerFallback;
}

export function PlanViewer({ ydoc: _ydoc, fallback }: PlanViewerProps) {
  // For M3, we still use the fallback content from URL
  // Full BlockNote Yjs collaboration will be added in M4
  const editor = useCreateBlockNote({
    initialContent: fallback.content,
  });

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  );
}
