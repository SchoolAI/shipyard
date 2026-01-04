import { getPlanFromUrl } from '@peer-plan/schema';
import { useMemo } from 'react';
import * as Y from 'yjs';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';

export function SnapshotPage() {
  const urlPlan = getPlanFromUrl();
  const ydoc = useMemo(() => new Y.Doc(), []); // Empty doc, not synced

  if (!urlPlan) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800">Invalid Snapshot</h1>
        <p className="text-gray-600">The URL does not contain valid plan data.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Snapshot banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
        <strong>Viewing snapshot</strong> - This is a read-only view of a plan at a specific point
        in time.
      </div>

      <PlanHeader ydoc={ydoc} fallback={urlPlan} />
      <PlanViewer ydoc={ydoc} fallback={urlPlan} />
    </div>
  );
}
