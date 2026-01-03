import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import type { UrlEncodedPlan } from '@peer-plan/schema';

interface PlanViewerProps {
  plan: UrlEncodedPlan;
}

export function PlanViewer({ plan }: PlanViewerProps) {
  const editor = useCreateBlockNote({
    initialContent: plan.content,
  });

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
      <BlockNoteView editor={editor} editable={false} theme="light" />
    </div>
  );
}
