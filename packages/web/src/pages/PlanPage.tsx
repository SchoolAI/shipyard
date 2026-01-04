import {
  getPlanIndexEntry,
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type PlanMetadata,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CommentsPanel, useThreadCount } from '@/components/CommentsPanel';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { ProfileSetup } from '@/components/ProfileSetup';
import { SyncStatus } from '@/components/SyncStatus';
import { useIdentity } from '@/hooks/useIdentity';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';

export function PlanPage() {
  const { id } = useParams<{ id: string }>();
  // The route /plan/:id guarantees id is defined
  const planId = id ?? '';
  const { ydoc, syncState, providers } = useMultiProviderSync(planId);
  const { identity } = useIdentity();
  const [metadata, setMetadata] = useState<PlanMetadata | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(true);
  const commentCount = useThreadCount(ydoc);

  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  const activeProvider = providers.find((p) => p.wsconnected) ?? providers[0] ?? null;

  useEffect(() => {
    const metaMap = ydoc.getMap('metadata');
    const update = () => {
      const newMetadata = getPlanMetadata(ydoc);
      setMetadata(newMetadata);
    };
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [ydoc]);

  // Memoize to prevent recreation on every render
  const handleRequestIdentity = useCallback(() => {
    setShowProfileSetup(true);
  }, []);

  const handleStatusChange = useCallback(
    (newStatus: 'approved' | 'changes_requested') => {
      if (!metadata) return;

      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      setPlanIndexEntry(indexDoc, {
        id: planId,
        title: metadata.title,
        status: newStatus,
        createdAt: existingEntry?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    },
    [indexDoc, planId, metadata]
  );

  const handleToggleComments = useCallback(() => {
    setCommentsPanelOpen((prev) => !prev);
  }, []);

  // MUST be before early returns (Rules of Hooks)
  const fallback = useMemo(() => {
    if (!metadata) {
      return {
        v: 1 as const,
        id: '',
        title: '',
        status: 'draft' as const,
        content: [],
      };
    }
    return {
      v: 1 as const,
      id: metadata.id,
      title: metadata.title,
      status: metadata.status,
      repo: metadata.repo,
      pr: metadata.pr,
      content: ydoc.getArray('content').toJSON(),
    };
  }, [metadata, ydoc]);

  // Early returns AFTER all hooks
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <SyncStatus {...syncState} />
          <PlanHeader
            ydoc={ydoc}
            metadata={metadata}
            identity={identity}
            onRequestIdentity={handleRequestIdentity}
            onStatusChange={handleStatusChange}
            commentCount={commentCount}
            commentsPanelOpen={commentsPanelOpen}
            onToggleComments={handleToggleComments}
          />
          {/* Key forces full remount when identity changes, ensuring
              useCreateBlockNote creates a fresh editor with correct extensions.
              Without this, changing from anonymous to identified user would crash
              because the editor was created without CommentsExtension. */}
          <PlanViewer
            key={identity?.id ?? 'anonymous'}
            ydoc={ydoc}
            fallback={fallback}
            identity={identity}
            provider={activeProvider}
            onRequestIdentity={handleRequestIdentity}
          />
        </div>
      </div>

      {/* Comments panel */}
      <CommentsPanel ydoc={ydoc} isOpen={commentsPanelOpen} onClose={handleToggleComments} />

      {/* Profile setup modal */}
      {showProfileSetup && (
        <ProfileSetup
          onComplete={() => setShowProfileSetup(false)}
          onCancel={() => setShowProfileSetup(false)}
        />
      )}
    </div>
  );
}
