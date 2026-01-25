import type { BlockNoteEditor } from '@blocknote/core';
import { Button, Spinner, useOverlayState } from '@heroui/react';
import {
  type AnyInputRequest,
  AnyInputRequestSchema,
  addArtifact,
  type Deliverable,
  extractDeliverables,
  getPlanFromUrl,
  getPlanIndexEntry,
  getPlanMetadata,
  getPlanOwnerId,
  type PlanMetadata,
  setPlanIndexEntry,
  setPlanMetadata,
  YDOC_KEYS,
} from '@shipyard/schema';
import { LogIn } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as Y from 'yjs';
import { AnyInputRequestModal } from '@/components/AnyInputRequestModal';
import { AuthChoiceModal } from '@/components/AuthChoiceModal';
import { GitHubAuthOverlay } from '@/components/GitHubAuthModal';
import { ImportConversationHandler } from '@/components/ImportConversationHandler';
import { MobileActionsMenu } from '@/components/MobileActionsMenu';
import { MobileHeader } from '@/components/MobileHeader';
import { PlanContent } from '@/components/PlanContent';
import { PlanHeader } from '@/components/PlanHeader';
import { ReviewActions } from '@/components/ReviewActions';
import { Sidebar } from '@/components/Sidebar';
import { SignInModal } from '@/components/SignInModal';
import { Drawer } from '@/components/ui/drawer';
import { WaitingRoomGate } from '@/components/WaitingRoomGate';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { usePlanIndexContext } from '@/contexts/PlanIndexContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useInputRequests } from '@/hooks/useInputRequests';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useLocalIdentity } from '@/hooks/useLocalIdentity';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import { usePendingUserNotifications } from '@/hooks/usePendingUserNotifications';
import { useVersionNavigation } from '@/hooks/useVersionNavigation';
import { colorFromString } from '@/utils/color';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page component handles complex sync state machine
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
    wsProvider,
    rtcProvider,
  } = useMultiProviderSync(isSnapshot ? '' : planId);

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

    // Populate deliverables from URL if present
    if (urlPlan.deliverables) {
      const deliverablesArray = doc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.push(urlPlan.deliverables);
    } else if (urlPlan.content) {
      // Extract from content as fallback
      const deliverables = extractDeliverables(urlPlan.content);
      const deliverablesArray = doc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.push(deliverables);
    }

    return doc;
  }, [isSnapshot, urlPlan]);

  const ydoc = isSnapshot ? (snapshotYdoc ?? syncedYdoc) : syncedYdoc;

  const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
  const { localIdentity, setLocalIdentity } = useLocalIdentity();
  const isMobile = useIsMobile();
  const drawerState = useOverlayState();
  const { setActivePlanSync, clearActivePlanSync } = useActivePlanSync();
  const [metadata, setMetadata] = useState<PlanMetadata | null>(null);
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);

  // Convert GitHub or local identity to BlockNote-compatible format
  // Priority: GitHub > Local > null
  const identity = githubIdentity
    ? {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      }
    : localIdentity
      ? {
          id: `local:${localIdentity.username}`,
          name: localIdentity.username,
          color: colorFromString(localIdentity.username),
        }
      : null;

  // Use shared plan index context to avoid duplicate WebRTC providers
  const { ydoc: indexDoc, myPlans, sharedPlans, inboxPlans, isLoading } = usePlanIndexContext();
  const { pendingRequests } = useInputRequests({ ydoc: indexDoc });
  const allPlans = useMemo(
    () => [...myPlans, ...sharedPlans, ...inboxPlans],
    [myPlans, sharedPlans, inboxPlans]
  );

  // Calculate total inbox count (plans + input requests) - for mobile header badge
  const totalInboxCount = useMemo(() => {
    return inboxPlans.length + pendingRequests.length;
  }, [inboxPlans, pendingRequests]);

  // Prefer WebSocket provider when connected, fall back to WebRTC for P2P-only mode.
  const activeProvider = isSnapshot ? null : (wsProvider ?? rtcProvider);

  // Store editor instance for snapshots (Issue #42)
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  // P2P grace period: when opening a shared URL, IndexedDB syncs immediately (empty)
  // but we need to wait for WebRTC to deliver the plan data before showing "Not Found"
  const [p2pGracePeriodExpired, setP2pGracePeriodExpired] = useState(false);

  // Timeout for when we have peers connected but still haven't received plan data
  const [peerSyncTimedOut, setPeerSyncTimedOut] = useState(false);

  // Input request modal state
  const [inputRequestModalOpen, setInputRequestModalOpen] = useState(false);
  const [currentInputRequest, setCurrentInputRequest] = useState<AnyInputRequest | null>(null);

  // Check if current user is the plan owner (for notifications)
  const ownerId = getPlanOwnerId(ydoc);
  const isOwner = !!(githubIdentity && ownerId && githubIdentity.username === ownerId);

  // Show toast notifications when new users request access (only for owners)
  usePendingUserNotifications(rtcProvider, isOwner);

  // Version navigation for viewing plan history (Issue #42)
  const versionNav = useVersionNavigation(isSnapshot ? null : ydoc);

  // Listen for 'open-input-request' custom events
  useEffect(() => {
    let isMounted = true;

    const handleOpenInputRequest = (event: Event) => {
      // Prevent state updates after component unmounts
      if (!isMounted) {
        return;
      }

      if (!(event instanceof CustomEvent)) return;
      const result = AnyInputRequestSchema.safeParse(event.detail);
      if (!result.success) return;

      // Prevent duplicate opens - if modal is already open with this request, ignore
      // Note: This only prevents duplicates within a single tab. Multi-tab coordination
      // would require BroadcastChannel or localStorage, but current UX is acceptable
      // (user sees "already answered" error if they try to answer in second tab)
      if (inputRequestModalOpen && currentInputRequest?.id === result.data.id) {
        return;
      }

      setCurrentInputRequest(result.data);
      setInputRequestModalOpen(true);
    };

    document.addEventListener('open-input-request', handleOpenInputRequest);

    return () => {
      isMounted = false;
      document.removeEventListener('open-input-request', handleOpenInputRequest);
    };
  }, [inputRequestModalOpen, currentInputRequest]);

  // Start timeout when in P2P-only mode without metadata
  useEffect(() => {
    const inP2POnlyMode = syncState.idbSynced && !syncState.hubConnected;
    const needsP2PData = !metadata && inP2POnlyMode;

    if (needsP2PData) {
      const gracePeriod = syncState.peerCount > 0 ? 30000 : 15000;
      const timeout = setTimeout(() => setP2pGracePeriodExpired(true), gracePeriod);
      return () => clearTimeout(timeout);
    }
    if (metadata) {
      setP2pGracePeriodExpired(false);
    }
    return undefined;
  }, [metadata, syncState.idbSynced, syncState.hubConnected, syncState.peerCount]);

  // Timeout when peers are connected but no data arrives after 30 seconds
  useEffect(() => {
    const hasPeersButNoData = syncState.peerCount > 0 && !metadata;

    if (hasPeersButNoData) {
      const timeout = setTimeout(() => setPeerSyncTimedOut(true), 30000);
      return () => clearTimeout(timeout);
    }

    // Reset timeout state when metadata arrives or peers disconnect
    setPeerSyncTimedOut(false);
    return undefined;
  }, [syncState.peerCount, metadata]);

  // Set metadata from URL for snapshots, or from Y.Doc for normal plans
  useEffect(() => {
    if (isSnapshot && urlPlan) {
      // For snapshots from URL, we only have minimal metadata
      // Treat as draft since we don't have full status-specific fields
      setMetadata({
        id: urlPlan.id,
        title: urlPlan.title,
        status: 'draft',
        repo: urlPlan.repo,
        pr: urlPlan.pr,
        createdAt: 0,
        updatedAt: 0,
      });
      return;
    }

    const metaMap = ydoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);
    const update = () => {
      const newMetadata = getPlanMetadata(ydoc);
      setMetadata(newMetadata);
    };
    update();
    metaMap.observe(update);
    return () => metaMap.unobserve(update);
  }, [ydoc, isSnapshot, urlPlan]);

  // Update context with active plan sync state
  useEffect(() => {
    setActivePlanSync(planId, syncState);
    return () => clearActivePlanSync();
  }, [planId, syncState, setActivePlanSync, clearActivePlanSync]);

  // When user tries to comment without identity, open auth choice modal
  const handleRequestIdentity = useCallback(() => {
    setShowAuthChoice(true);
  }, []);

  const handleLocalSignIn = useCallback(
    (username: string) => {
      setLocalIdentity(username);
      setShowLocalSignIn(false);
    },
    [setLocalIdentity]
  );

  // Store editor instance when ready (Issue #42)
  const handleEditorReady = useCallback((editorInstance: BlockNoteEditor) => {
    setEditor(editorInstance);
  }, []);

  const handleStatusChange = useCallback(
    (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => {
      if (!metadata) return;

      // Only update plan-index if the plan is already there (owned by this user's MCP server)
      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (!existingEntry) return;

      // Use the same timestamp that was used to update the plan doc
      setPlanIndexEntry(indexDoc, {
        ...existingEntry,
        status: newStatus,
        updatedAt,
      });
    },
    [indexDoc, planId, metadata]
  );

  const handleTagsChange = useCallback(
    (newTags: string[]) => {
      if (!metadata || isSnapshot) return;

      // Update plan metadata
      setPlanMetadata(ydoc, { tags: newTags }, githubIdentity?.username);

      // Update plan index entry
      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (existingEntry) {
        setPlanIndexEntry(indexDoc, {
          ...existingEntry,
          tags: newTags,
          updatedAt: Date.now(),
        });
      }
    },
    [ydoc, indexDoc, planId, metadata, githubIdentity?.username, isSnapshot]
  );

  // Mark plan as deleted in index if metadata is missing after sync.
  useEffect(() => {
    if (syncState.synced && syncState.connected && !metadata) {
      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (existingEntry && !existingEntry.deleted) {
        setPlanIndexEntry(indexDoc, {
          id: existingEntry.id,
          title: existingEntry.title,
          status: existingEntry.status,
          createdAt: existingEntry.createdAt,
          updatedAt: existingEntry.updatedAt,
          ownerId: existingEntry.ownerId,
          deleted: true,
          deletedAt: Date.now(),
          deletedBy: 'Unknown',
        });
      }
    }
  }, [syncState.synced, syncState.connected, metadata, indexDoc, planId]);

  // Early returns AFTER all hooks
  if (!isSnapshot) {
    // Phase 1: Initial loading
    if (!syncState.idbSynced) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] p-4">
          <div className="flex flex-col items-center gap-4">
            <Spinner size="lg" />
            <p className="text-muted-foreground">Loading task...</p>
          </div>
        </div>
      );
    }

    // Phase 2: P2P-only mode - waiting for peers to sync data
    const inP2POnlyMode = syncState.idbSynced && !syncState.hubConnected;
    const waitingForP2P = inP2POnlyMode && !metadata && !p2pGracePeriodExpired;
    const hasPeersButNoData = syncState.peerCount > 0 && !metadata;

    // Show timeout error when peers connected but no data after 30s
    if (peerSyncTimedOut && !metadata) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] p-4">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
              <span className="text-danger text-2xl">!</span>
            </div>
            <div>
              <p className="text-foreground font-medium mb-2">Sync Failed</p>
              <p className="text-sm text-muted-foreground mb-4">
                Connected to {syncState.peerCount} peer{syncState.peerCount > 1 ? 's' : ''} but
                couldn&apos;t load task data. The peer may not have the plan you&apos;re looking
                for.
              </p>
            </div>
            <Button variant="primary" onPress={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      );
    }

    if (!metadata && (waitingForP2P || hasPeersButNoData)) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] p-4">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <Spinner size="lg" />
            <div>
              <p className="text-foreground font-medium mb-2">
                {syncState.peerCount > 0
                  ? `Syncing from ${syncState.peerCount} peer${syncState.peerCount > 1 ? 's' : ''}...`
                  : 'Waiting for peers...'}
              </p>
              <p className="text-sm text-muted-foreground">
                This task is shared via P2P. It may take a moment to connect.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (!metadata) {
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

              <p className="text-muted-foreground mb-4">Sign in with GitHub to access this task.</p>

              <p className="text-sm text-muted-foreground mb-6">
                If you own this task or have been granted access, you'll be able to view it after
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

      return (
        <div className="p-8 text-center">
          <h1 className="text-xl font-bold text-foreground">Task Not Found</h1>
          <p className="text-muted-foreground">The task &quot;{id}&quot; does not exist.</p>
          <p className="text-sm text-muted-foreground mt-2">
            The task owner may be offline, or this link may be invalid.
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
        <p className="text-muted-foreground">The URL does not contain valid task data.</p>
      </div>
    );
  }

  // Metadata should be set at this point
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
      rtcProvider={rtcProvider}
      onStartAuth={startAuth}
      planId={planId}
      isSnapshot={isSnapshot}
    >
      {!isSnapshot && (
        <ImportConversationHandler planId={planId} ydoc={ydoc} rtcProvider={rtcProvider} />
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* Header bar with plan metadata - hidden on mobile */}
        {!isMobile && (
          <div className="border-b border-separator bg-surface px-2 md:px-6 py-1 md:py-2 shrink-0">
            <PlanHeader
              ydoc={ydoc}
              indexDoc={indexDoc}
              planId={planId}
              metadata={metadata}
              identity={identity}
              onRequestIdentity={handleRequestIdentity}
              onStatusChange={handleStatusChange}
              isSnapshot={isSnapshot}
              rtcProvider={rtcProvider}
              editor={editor}
              onTagsChange={handleTagsChange}
              allPlans={allPlans}
            />
          </div>
        )}

        {/* Tabbed content using PlanContent component */}
        {isSnapshot && urlPlan?.content ? (
          <PlanContent
            mode="snapshot"
            ydoc={ydoc}
            metadata={metadata}
            syncState={syncState}
            initialContent={urlPlan.content}
          />
        ) : (
          <PlanContent
            mode="live"
            ydoc={ydoc}
            metadata={metadata}
            syncState={syncState}
            identity={identity}
            onRequestIdentity={handleRequestIdentity}
            provider={activeProvider}
            currentSnapshot={versionNav.currentSnapshot}
            onEditorReady={handleEditorReady}
            versionNav={versionNav}
          />
        )}

        {/* Mobile review actions */}
        {isMobile && metadata && !isSnapshot && (
          <div className="fixed bottom-3 right-3 z-30 pb-safe">
            <div className="bg-surface rounded-lg shadow-lg border border-separator p-2">
              <ReviewActions
                ydoc={ydoc}
                currentStatus={metadata.status}
                identity={identity}
                onRequestIdentity={handleRequestIdentity}
                onStatusChange={handleStatusChange}
                editor={editor}
              />
            </div>
          </div>
        )}
      </div>
    </WaitingRoomGate>
  );

  // Mobile: Custom header overlays Layout's default header
  if (isMobile && metadata) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50">
          <MobileHeader
            onMenuOpen={drawerState.open}
            title={metadata.title}
            status={metadata.status}
            hubConnected={syncState?.connected}
            peerCount={syncState?.peerCount}
            indexDoc={indexDoc}
            planId={planId}
            inboxCount={totalInboxCount}
            isLoadingInbox={isLoading}
            rightContent={
              <MobileActionsMenu
                planId={planId}
                ydoc={ydoc}
                rtcProvider={rtcProvider}
                metadata={metadata}
                indexDoc={indexDoc}
              />
            }
          />
        </div>
        <Drawer isOpen={drawerState.isOpen} onOpenChange={drawerState.setOpen} side="left">
          <Sidebar inDrawer onNavigate={drawerState.close} />
        </Drawer>
        {pageContent}
        <AnyInputRequestModal
          isOpen={inputRequestModalOpen}
          request={currentInputRequest}
          ydoc={indexDoc}
          planYdoc={ydoc}
          onClose={() => {
            setInputRequestModalOpen(false);
            setCurrentInputRequest(null);
          }}
        />
        <GitHubAuthOverlay authState={authState} />
        <AuthChoiceModal
          isOpen={showAuthChoice}
          onOpenChange={setShowAuthChoice}
          onGitHubAuth={startAuth}
          onLocalAuth={() => setShowLocalSignIn(true)}
        />
        <SignInModal
          isOpen={showLocalSignIn}
          onClose={() => setShowLocalSignIn(false)}
          onSignIn={handleLocalSignIn}
        />
      </>
    );
  }

  return (
    <>
      {pageContent}
      <AnyInputRequestModal
        isOpen={inputRequestModalOpen}
        request={currentInputRequest}
        ydoc={indexDoc}
        planYdoc={ydoc}
        onClose={() => {
          setInputRequestModalOpen(false);
          setCurrentInputRequest(null);
        }}
      />
      <GitHubAuthOverlay authState={authState} />
      <AuthChoiceModal
        isOpen={showAuthChoice}
        onOpenChange={setShowAuthChoice}
        onGitHubAuth={startAuth}
        onLocalAuth={() => setShowLocalSignIn(true)}
      />
      <SignInModal
        isOpen={showLocalSignIn}
        onClose={() => setShowLocalSignIn(false)}
        onSignIn={handleLocalSignIn}
      />
    </>
  );
}
