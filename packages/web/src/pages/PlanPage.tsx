import { getPlanMetadata, type PlanMetadata } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { SyncStatus } from '@/components/SyncStatus';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';

export function PlanPage() {
  const { id } = useParams<{ id: string }>();
  // The route /plan/:id guarantees id is defined
  const planId = id ?? '';
  const { ydoc, syncState } = useMultiProviderSync(planId);
  const [metadata, setMetadata] = useState<PlanMetadata | null>(null);

  useEffect(() => {
    const metaMap = ydoc.getMap('metadata');
    const update = () => setMetadata(getPlanMetadata(ydoc));
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [ydoc]);

  if (!metadata && !syncState.synced) {
    return (
      <div className="p-8">
        <SyncStatus {...syncState} />
        <p className="text-gray-600 mt-4">Loading plan...</p>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-gray-800">Plan Not Found</h1>
        <p className="text-gray-600">The plan &quot;{id}&quot; does not exist.</p>
      </div>
    );
  }

  // Create fallback from metadata for components expecting it
  const fallback = {
    v: 1 as const,
    id: metadata.id,
    title: metadata.title,
    status: metadata.status,
    repo: metadata.repo,
    pr: metadata.pr,
    content: ydoc.getArray('content').toJSON(),
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <SyncStatus {...syncState} />
      <PlanHeader ydoc={ydoc} fallback={fallback} />
      <PlanViewer ydoc={ydoc} fallback={fallback} />
    </div>
  );
}
