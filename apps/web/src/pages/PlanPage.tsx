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
  type PlanViewTab,
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

/**
 * Check if a string is a valid PlanViewTab.
 * TypeScript's includes() requires explicit cast for const arrays with string input.
 */
function isValidTab(tab: string | null): tab is PlanViewTab {
  if (tab === null) return false;
  return tab === 'plan' || tab === 'activity' || tab === 'deliverables' || tab === 'changes';
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page component handles complex sync state machine
export function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPlan = searchParams.has('d') ? getPlanFromUrl() : null;
  const isSnapshot = urlPlan !== null;

  /** Read tab from URL, default to 'plan' if invalid or missing */
  const tabFromUrl = searchParams.get('tab');
  const initialTab: PlanViewTab = isValidTab(tabFromUrl) ? tabFromUrl : 'plan';

  /** Update URL when tab changes (without triggering navigation) */
  const handleTabChange = useCallback(
    (tab: PlanViewTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === 'plan') {
            /** Remove tab param for default tab to keep URLs clean */
            next.delete('tab');
          } else {
            next.set('tab', tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  /** For snapshots, use planId from URL; for normal plans, use route param */
  const planId = isSnapshot ? (urlPlan?.id ?? '') : (id ?? '');

  const {
    ydoc: syncedYdoc,
    syncState,
    wsProvider,
    rtcProvider,
  } = useMultiProviderSync(isSnapshot ? '' : planId);

  const snapshotYdoc = useMemo(() => {
    if (!isSnapshot || !urlPlan) return null;

    const doc = new Y.Doc();
    if (urlPlan.artifacts) {
      for (const artifact of urlPlan.artifacts) {
        addArtifact(doc, artifact);
      }
    }

    if (urlPlan.deliverables) {
      const deliverablesArray = doc.getArray<Deliverable>(YDOC_KEYS.DELIVERABLES);
      deliverablesArray.push(urlPlan.deliverables);
    } else if (urlPlan.content) {
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

  const { ydoc: indexDoc, myPlans, sharedPlans, inboxPlans, isLoading } = usePlanIndexContext();
  const { pendingRequests } = useInputRequests({ ydoc: indexDoc });
  const allPlans = useMemo(
    () => [...myPlans, ...sharedPlans, ...inboxPlans],
    [myPlans, sharedPlans, inboxPlans]
  );

  const totalInboxCount = useMemo(() => {
    return inboxPlans.length + pendingRequests.length;
  }, [inboxPlans, pendingRequests]);

  const activeProvider = isSnapshot ? null : (wsProvider ?? rtcProvider);

  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);

  const [p2pGracePeriodExpired, setP2pGracePeriodExpired] = useState(false);

  const [peerSyncTimedOut, setPeerSyncTimedOut] = useState(false);

  const [inputRequestModalOpen, setInputRequestModalOpen] = useState(false);
  const [currentInputRequest, setCurrentInputRequest] = useState<AnyInputRequest | null>(null);

  const ownerId = getPlanOwnerId(ydoc);
  const isOwner = !!(githubIdentity && ownerId && githubIdentity.username === ownerId);

  usePendingUserNotifications(rtcProvider, isOwner);

  const versionNav = useVersionNavigation(isSnapshot ? null : ydoc);

  useEffect(() => {
    let isMounted = true;

    const handleOpenInputRequest = (event: Event) => {
      if (!isMounted) {
        return;
      }

      if (!(event instanceof CustomEvent)) return;
      const result = AnyInputRequestSchema.safeParse(event.detail);
      if (!result.success) return;

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

  useEffect(() => {
    const hasPeersButNoData = syncState.peerCount > 0 && !metadata;

    if (hasPeersButNoData) {
      const timeout = setTimeout(() => setPeerSyncTimedOut(true), 30000);
      return () => clearTimeout(timeout);
    }

    setPeerSyncTimedOut(false);
    return undefined;
  }, [syncState.peerCount, metadata]);

  useEffect(() => {
    if (isSnapshot && urlPlan) {
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

  useEffect(() => {
    setActivePlanSync(planId, syncState);
    return () => clearActivePlanSync();
  }, [planId, syncState, setActivePlanSync, clearActivePlanSync]);

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

  const handleEditorReady = useCallback((editorInstance: BlockNoteEditor) => {
    setEditor(editorInstance);
  }, []);

  const handleStatusChange = useCallback(
    (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => {
      if (!metadata) return;

      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (!existingEntry) return;

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

      setPlanMetadata(ydoc, { tags: newTags }, githubIdentity?.username);

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

  if (!isSnapshot) {
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

    const inP2POnlyMode = syncState.idbSynced && !syncState.hubConnected;
    const waitingForP2P = inP2POnlyMode && !metadata && !p2pGracePeriodExpired;
    const hasPeersButNoData = syncState.peerCount > 0 && !metadata;

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

  if (isSnapshot && !urlPlan) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-foreground">Invalid Snapshot</h1>
        <p className="text-muted-foreground">The URL does not contain valid task data.</p>
      </div>
    );
  }

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
            initialTab={initialTab}
            onTabChange={handleTabChange}
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
            initialTab={initialTab}
            onTabChange={handleTabChange}
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
