import { Button, useOverlayState } from '@heroui/react';
import {
  addArtifact,
  extractDeliverables,
  getDeliverables,
  getPlanFromUrl,
  getPlanIndexEntry,
  getPlanMetadata,
  getPlanOwnerId,
  PLAN_INDEX_DOC_NAME,
  type PlanMetadata,
  setPlanIndexEntry,
  YDOC_KEYS,
} from '@peer-plan/schema';
import { FileText, LogIn, Package } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as Y from 'yjs';
import { Attachments } from '@/components/Attachments';
import { DeliverablesView } from '@/components/DeliverablesView';
import { MobileHeader } from '@/components/MobileHeader';
import { PlanHeader } from '@/components/PlanHeader';
import { PlanViewer } from '@/components/PlanViewer';
import { ProfileSetup } from '@/components/ProfileSetup';
import { ReviewActions } from '@/components/ReviewActions';
import { ShareButton } from '@/components/ShareButton';
import { Sidebar } from '@/components/Sidebar';
import { Drawer } from '@/components/ui/drawer';
import { WaitingRoomGate } from '@/components/WaitingRoomGate';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useIdentity } from '@/hooks/useIdentity';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePendingUserNotifications } from '@/hooks/usePendingUserNotifications';

type ViewType = 'plan' | 'deliverables';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component has necessary conditional logic for sync state handling
export function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const urlPlan = searchParams.has('d') ? getPlanFromUrl() : null;
  const isSnapshot = urlPlan !== null;

  // For snapshots, use planId from URL; for normal plans, use route param
  const planId = isSnapshot ? (urlPlan?.id ?? '') : (id ?? '');

  const {
    ydoc: syncedYdoc,
    syncState,
    providers,
    rtcProvider,
  } = useMultiProviderSync(isSnapshot ? '' : planId); // Don't sync snapshots

  // For snapshots, create local Y.Doc hydrated with URL data
  const snapshotYdoc = useMemo(() => {
    if (!isSnapshot || !urlPlan) return null;

    const doc = new Y.Doc();
    // Add artifacts if present
    if (urlPlan.artifacts) {
      for (const artifact of urlPlan.artifacts) {
        addArtifact(doc, artifact);
      }
    }
    return doc;
  }, [isSnapshot, urlPlan]);

  const ydoc = isSnapshot ? (snapshotYdoc ?? syncedYdoc) : syncedYdoc;

  const { identity } = useIdentity();
  const { identity: githubIdentity, startAuth } = useGitHubAuth();
  const isMobile = useIsMobile();
  const drawerState = useOverlayState();
  const { setActivePlanSync, clearActivePlanSync } = useActivePlanSync();
  const [metadata, setMetadata] = useState<PlanMetadata | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('plan');
  const [deliverableCount, setDeliverableCount] = useState({ completed: 0, total: 0 });
  // Track if user was trying to comment when they opened profile setup
  const wasRequestingCommentRef = useRef(false);

  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);
  // Prefer WebSocket provider when connected, fall back to WebRTC for P2P-only mode.
  // This ensures BlockNote binds to the Y.Doc fragment even without a WebSocket server,
  // so comment highlights sync properly via WebRTC.
  const activeWsProvider = providers.find((p) => p.wsconnected) ?? providers[0] ?? null;
  const activeProvider = isSnapshot ? null : (activeWsProvider ?? rtcProvider);

  // P2P grace period: when opening a shared URL, IndexedDB syncs immediately (empty)
  // but we need to wait for WebRTC to deliver the plan data before showing "Not Found"
  const [p2pGracePeriodExpired, setP2pGracePeriodExpired] = useState(false);

  // Check if current user is the plan owner (for notifications)
  const ownerId = getPlanOwnerId(ydoc);
  const isOwner = !!(githubIdentity && ownerId && githubIdentity.username === ownerId);

  // Show toast notifications when new users request access (only for owners)
  usePendingUserNotifications(rtcProvider, isOwner);

  // Start timeout when in P2P-only mode without metadata
  useEffect(() => {
    const inP2POnlyMode = syncState.idbSynced && !syncState.synced && syncState.activeCount === 0;
    const needsP2PData = !metadata && inP2POnlyMode;

    if (needsP2PData) {
      const timeout = setTimeout(() => setP2pGracePeriodExpired(true), 5000);
      return () => clearTimeout(timeout);
    }
    // Reset if metadata arrives (plan found via P2P)
    if (metadata) {
      setP2pGracePeriodExpired(false);
    }
    return undefined;
  }, [metadata, syncState.idbSynced, syncState.synced, syncState.activeCount]);

  // Set metadata from URL for snapshots, or from Y.Doc for normal plans
  useEffect(() => {
    if (isSnapshot && urlPlan) {
      setMetadata({
        id: urlPlan.id,
        title: urlPlan.title,
        status: urlPlan.status,
        repo: urlPlan.repo,
        pr: urlPlan.pr,
        createdAt: 0,
        updatedAt: 0,
      });
      return;
    }

    const metaMap = ydoc.getMap('metadata');
    const update = () => {
      const newMetadata = getPlanMetadata(ydoc);
      setMetadata(newMetadata);
    };
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [ydoc, isSnapshot, urlPlan]);

  // Subscribe to deliverables for tab count
  useEffect(() => {
    // For snapshots, use deliverables from URL (with linkage info) or extract from content
    if (isSnapshot && urlPlan) {
      // Prefer deliverables from URL (includes linkage info), fall back to extracting from content
      const deliverables = urlPlan.deliverables ?? extractDeliverables(urlPlan.content);
      // Populate deliverables array in Y.Doc so components can access them
      const deliverablesArray = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.delete(0, deliverablesArray.length); // Clear existing
      deliverablesArray.push(deliverables);

      // Count completed deliverables (those with linkedArtifactId)
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setDeliverableCount({ completed, total: deliverables.length });
      return;
    }

    // For normal plans, observe Y.Doc changes
    const deliverablesArray = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
    const updateCount = () => {
      const deliverables = getDeliverables(ydoc);
      const completed = deliverables.filter((d) => d.linkedArtifactId).length;
      setDeliverableCount({ completed, total: deliverables.length });
    };
    updateCount();
    deliverablesArray.observe(updateCount);
    return () => deliverablesArray.unobserve(updateCount);
  }, [ydoc, isSnapshot, urlPlan]);

  // Update context with active plan sync state
  useEffect(() => {
    setActivePlanSync(planId, syncState);
    return () => clearActivePlanSync();
  }, [planId, syncState, setActivePlanSync, clearActivePlanSync]);

  // When user tries to comment without identity, we show profile setup
  const handleRequestIdentity = useCallback(() => {
    wasRequestingCommentRef.current = true;
    setShowProfileSetup(true);
  }, []);

  const handleStatusChange = useCallback(
    (newStatus: 'approved' | 'changes_requested') => {
      if (!metadata) return;

      // Only update plan-index if the plan is already there (owned by this user's MCP server)
      // Don't add shared plans to plan-index - they should stay in "Shared with me"
      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (!existingEntry) return;

      setPlanIndexEntry(indexDoc, {
        ...existingEntry,
        status: newStatus,
        updatedAt: Date.now(),
      });
    },
    [indexDoc, planId, metadata]
  );

  // Mark plan as deleted in index if metadata is missing after sync.
  // Only do this if we have at least one connected WebSocket server - this ensures
  // we're not incorrectly marking plans as deleted in P2P-only mode or during
  // initial connection setup. Without a connected server, we can't be sure the
  // plan doesn't exist vs just being slow to sync.
  useEffect(() => {
    if (syncState.synced && syncState.activeCount > 0 && !metadata) {
      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (existingEntry && !existingEntry.deletedAt) {
        setPlanIndexEntry(indexDoc, {
          ...existingEntry,
          deletedAt: Date.now(),
        });
      }
    }
  }, [syncState.synced, syncState.activeCount, metadata, indexDoc, planId]);

  // Early returns AFTER all hooks
  // Skip loading/not-found checks for snapshots (they have URL data)
  if (!isSnapshot) {
    // Show loading while:
    // 1. Neither WebSocket has synced NOR IndexedDB has synced, OR
    // 2. In P2P-only mode (no servers) and still waiting for peers to sync data
    const inP2POnlyMode = syncState.idbSynced && !syncState.synced && syncState.activeCount === 0;
    const waitingForP2P = inP2POnlyMode && !metadata && !p2pGracePeriodExpired;
    const isStillLoading = (!syncState.synced && !syncState.idbSynced) || waitingForP2P;

    if (!metadata && isStillLoading) {
      return (
        <div className="p-8">
          <p className="text-muted-foreground">
            {waitingForP2P ? 'Syncing from peers...' : 'Loading plan...'}
          </p>
        </div>
      );
    }

    if (!metadata) {
      // If user is not authenticated, they need to sign in first
      // Don't show "Plan Not Found" - the plan might exist but we can't verify without auth
      if (!githubIdentity) {
        return (
          <div className="flex items-center justify-center min-h-[60vh] p-4">
            <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
              <div className="flex justify-center mb-6">
                <LogIn className="w-12 h-12 text-primary" />
              </div>

              <h1 className="text-xl font-semibold text-foreground mb-2">
                Authentication Required
              </h1>

              <p className="text-muted-foreground mb-4">Sign in with GitHub to access this plan.</p>

              <p className="text-sm text-muted-foreground mb-6">
                If you own this plan or have been granted access, you'll be able to view it after
                signing in.
              </p>

              <Button onPress={() => startAuth()} variant="primary" className="w-full">
                <LogIn className="w-4 h-4" />
                Sign in with GitHub
              </Button>
            </div>
          </div>
        );
      }

      // User is authenticated but plan still doesn't exist
      return (
        <div className="p-8 text-center">
          <h1 className="text-xl font-bold text-foreground">Plan Not Found</h1>
          <p className="text-muted-foreground">The plan &quot;{id}&quot; does not exist.</p>
          <p className="text-sm text-muted-foreground mt-2">
            It has been removed from your sidebar.
          </p>
        </div>
      );
    }
  }

  // For snapshots, handle invalid URL
  if (isSnapshot && !urlPlan) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-foreground">Invalid Snapshot</h1>
        <p className="text-muted-foreground">The URL does not contain valid plan data.</p>
      </div>
    );
  }

  // Metadata should be set at this point (either from URL or Y.Doc)
  if (!metadata) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const pageContent = (
    <WaitingRoomGate
      ydoc={ydoc}
      syncState={syncState}
      metadata={metadata}
      githubIdentity={githubIdentity}
      onStartAuth={startAuth}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header bar with plan metadata - hidden on mobile (shown in MobileHeader instead) */}
        {!isMobile && (
          <div className="border-b border-separator bg-surface px-2 md:px-6 py-1 md:py-3 shrink-0">
            <PlanHeader
              ydoc={ydoc}
              planId={planId}
              metadata={metadata}
              identity={identity}
              onRequestIdentity={handleRequestIdentity}
              onStatusChange={handleStatusChange}
              isSnapshot={isSnapshot}
              rtcProvider={rtcProvider}
            />
          </div>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab navigation */}
          <div className="border-b border-separator bg-surface px-2 md:px-6 py-1 md:py-2 shrink-0">
            <div className="flex gap-0 md:gap-4">
              <button
                type="button"
                onClick={() => setActiveView('plan')}
                className={`flex items-center justify-center gap-2 pb-2 px-2 font-medium text-sm transition-colors flex-1 md:flex-initial ${
                  activeView === 'plan'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                }`}
              >
                <FileText className="w-4 h-4" />
                Plan
              </button>
              <button
                type="button"
                onClick={() => setActiveView('deliverables')}
                className={`flex items-center justify-center gap-2 pb-2 px-2 font-medium text-sm transition-colors flex-1 md:flex-initial ${
                  activeView === 'deliverables'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                }`}
              >
                <Package className="w-4 h-4" />
                Deliverables
                {deliverableCount.total > 0 && (
                  <span className="text-xs opacity-70">
                    ({deliverableCount.completed}/{deliverableCount.total})
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Tab content */}
          {activeView === 'plan' && (
            <div className="flex-1 overflow-y-auto bg-background">
              <div className="max-w-4xl mx-auto px-1 py-2 md:p-6 space-y-3 md:space-y-6">
                {/* Key forces full remount when identity changes, ensuring
                    useCreateBlockNote creates a fresh editor with correct extensions.
                    Without this, changing from anonymous to identified user would crash
                    because the editor was created without CommentsExtension. */}
                <PlanViewer
                  key={identity?.id ?? 'anonymous'}
                  ydoc={ydoc}
                  identity={isSnapshot ? null : identity}
                  provider={activeProvider}
                  onRequestIdentity={isSnapshot ? undefined : handleRequestIdentity}
                  initialContent={isSnapshot ? urlPlan?.content : undefined}
                />
                <Attachments ydoc={ydoc} />
              </div>
            </div>
          )}

          {activeView === 'deliverables' && (
            <div className="flex-1 overflow-y-auto bg-background">
              <DeliverablesView
                ydoc={ydoc}
                metadata={metadata}
                identity={identity}
                onRequestIdentity={handleRequestIdentity}
              />
            </div>
          )}
        </div>

        {/* Floating review actions on mobile - hide for snapshots */}
        {isMobile && metadata && !isSnapshot && (
          <div className="fixed bottom-3 right-3 z-30 pb-safe">
            <div className="bg-surface rounded-lg shadow-lg border border-separator p-2">
              <ReviewActions
                ydoc={ydoc}
                currentStatus={metadata.status}
                identity={identity}
                onRequestIdentity={handleRequestIdentity}
                onStatusChange={handleStatusChange}
              />
            </div>
          </div>
        )}

        {/* Profile setup modal */}
        {showProfileSetup && (
          <ProfileSetup
            onComplete={() => {
              setShowProfileSetup(false);
              if (wasRequestingCommentRef.current) {
                wasRequestingCommentRef.current = false;
                toast.success('Ready to comment!', {
                  description: 'Select text in the document, then click Comment.',
                });
              }
            }}
            onCancel={() => {
              setShowProfileSetup(false);
              wasRequestingCommentRef.current = false;
            }}
          />
        )}
      </div>
    </WaitingRoomGate>
  );

  // Mobile: Custom header overlays Layout's default header
  if (isMobile && metadata) {
    return (
      <>
        {/* Fixed header overlays Layout's default "Peer Plan" header */}
        <div className="fixed top-0 left-0 right-0 z-50">
          <MobileHeader
            onMenuOpen={drawerState.open}
            title={metadata.title}
            status={metadata.status}
            agentCount={syncState?.activeCount}
            peerCount={syncState?.peerCount}
            rightContent={<ShareButton />}
          />
        </div>
        <Drawer isOpen={drawerState.isOpen} onOpenChange={drawerState.setOpen} side="left">
          <Sidebar inDrawer onNavigate={drawerState.close} />
        </Drawer>
        {pageContent}
      </>
    );
  }

  // Desktop: Standard layout
  return pageContent;
}
