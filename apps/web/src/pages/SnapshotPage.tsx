import { getPlanFromUrl, type PlanMetadata } from '@peer-plan/schema';
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
        <h1 className="text-xl font-bold text-foreground">Invalid Snapshot</h1>
        <p className="text-muted-foreground">The URL does not contain valid plan data.</p>
      </div>
    );
  }

  // Snapshot view is read-only, no identity needed
  const noOp = () => {};

  // Snapshots are static - no timestamps needed
  const snapshotMetadata: PlanMetadata = {
    id: urlPlan.id,
    title: urlPlan.title,
    status: urlPlan.status,
    repo: urlPlan.repo,
    pr: urlPlan.pr,
    createdAt: 0,
    updatedAt: 0,
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Snapshot banner */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-amber-800 dark:text-amber-200 text-sm">
        <strong>Viewing snapshot</strong> - This is a read-only view of a plan at a specific point
        in time.
      </div>

      <PlanHeader
        ydoc={ydoc}
        metadata={snapshotMetadata}
        identity={null}
        onRequestIdentity={noOp}
      />
      <PlanViewer ydoc={ydoc} identity={null} />
    </div>
  );
}
