import {
  getPlanIndexEntry,
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type PlanMetadata,
  setPlanIndexEntry,
} from '@peer-plan/schema';
import { FileText, Package } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Attachments } from '@/components/Attachments';
import { DeliverablesView } from '@/components/DeliverablesView';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { ProfileSetup } from '@/components/ProfileSetup';
import { ShareButton } from '@/components/ShareButton';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useIdentity } from '@/hooks/useIdentity';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { cn } from '@/lib/utils';

type ViewType = 'plan' | 'deliverables';

// Long enough to read, short enough not to linger
const HINT_AUTO_DISMISS_MS = 8000;

export function PlanPage() {
  const { id } = useParams<{ id: string }>();
  // The route /plan/:id guarantees id is defined
  const planId = id ?? '';
  const { ydoc, syncState, providers, rtcProvider } = useMultiProviderSync(planId);
  const { identity } = useIdentity();
  const { setActivePlanSync, clearActivePlanSync } = useActivePlanSync();
  const [metadata, setMetadata] = useState<PlanMetadata | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [pendingCommentHint, setPendingCommentHint] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('plan');

  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  // Prefer WebSocket provider when connected, fall back to WebRTC for P2P-only mode.
  // This ensures BlockNote binds to the Y.Doc fragment even without a WebSocket server,
  // so comment highlights sync properly via WebRTC.
  const activeWsProvider = providers.find((p) => p.wsconnected) ?? providers[0] ?? null;
  const activeProvider = activeWsProvider ?? rtcProvider;

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

  // Update context with active plan sync state
  useEffect(() => {
    setActivePlanSync(planId, syncState);
    return () => clearActivePlanSync();
  }, [planId, syncState, setActivePlanSync, clearActivePlanSync]);

  // When user tries to comment without identity, we show profile setup
  // and track that they were trying to comment
  const handleRequestIdentity = useCallback(() => {
    setShowProfileSetup(true);
    setPendingCommentHint(true);
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

  useEffect(() => {
    if (!pendingCommentHint || !identity) return;
    const timer = setTimeout(() => setPendingCommentHint(false), HINT_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [pendingCommentHint, identity]);

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
        <p className="text-slate-600">Loading plan...</p>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-slate-800">Plan Not Found</h1>
        <p className="text-slate-600">The plan &quot;{id}&quot; does not exist.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* View tabs bar */}
      <div className="border-b px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'plan'}
            onClick={() => setActiveView('plan')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              activeView === 'plan'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <FileText className="w-4 h-4" />
            Plan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'deliverables'}
            onClick={() => setActiveView('deliverables')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              activeView === 'deliverables'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Package className="w-4 h-4" />
            Deliverables
          </button>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton />
        </div>
      </div>

      {/* Header bar with plan metadata */}
      <div className="border-b px-6 py-3 shrink-0">
        <PlanHeader
          ydoc={ydoc}
          metadata={metadata}
          identity={identity}
          onRequestIdentity={handleRequestIdentity}
          onStatusChange={handleStatusChange}
        />
      </div>

      {/* View content */}
      <div className="flex-1 overflow-y-auto">
        {activeView === 'plan' && (
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {/* Hint shown after profile setup when user was trying to comment */}
            {pendingCommentHint && identity && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
                <p className="text-primary text-sm">
                  <span className="font-medium">Ready to comment!</span> Select text in the document
                  below, then click the Comment button.
                </p>
                <button
                  type="button"
                  onClick={() => setPendingCommentHint(false)}
                  className="text-primary hover:text-primary/90 ml-4"
                  aria-label="Dismiss hint"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
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
            <Attachments ydoc={ydoc} />
          </div>
        )}
        {activeView === 'deliverables' && <DeliverablesView planId={planId} />}
      </div>

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
