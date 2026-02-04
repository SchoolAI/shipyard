import { Button } from '@heroui/react';
import type { PlanMetadata } from '@shipyard/schema';
import { Clock, Loader2, LogIn, ShieldX, User } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { useBroadcastApprovalStatus } from '@/hooks/useBroadcastApprovalStatus';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import type { SyncState } from '@/hooks/useMultiProviderSync';
import { useYDocApprovalStatus } from '@/hooks/useYDocApprovalStatus';
import { isPlanAwarenessState } from '@/types/awareness';

/**
 * Helper function for exhaustive switch checking.
 * TypeScript will error if any case is not handled.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled gate decision: ${JSON.stringify(value)}`);
}

interface WaitingRoomGateProps {
  ydoc: Y.Doc;
  syncState: SyncState;
  metadata: PlanMetadata;
  githubIdentity: GitHubIdentity | null;
  rtcProvider: WebrtcProvider | null;
  onStartAuth: () => void;
  children: ReactNode;
  planId: string;
  isSnapshot: boolean;
}

/**
 * Check if a pending request has expired (over 24 hours old).
 */
function checkRequestExpired(isPending: boolean, rtcProvider: WebrtcProvider | null): boolean {
  if (!isPending || !rtcProvider) return false;

  const awareness = rtcProvider.awareness;
  const localState = awareness.getLocalState();
  const localStateRecord =
    localState && typeof localState === 'object'
      ? Object.fromEntries(Object.entries(localState))
      : {};
  const planStatusRaw = localStateRecord.planStatus;
  const planStatus = isPlanAwarenessState(planStatusRaw) ? planStatusRaw : undefined;

  if (!planStatus || planStatus.status !== 'pending') return false;

  const requestAge = Date.now() - planStatus.requestedAt;
  return requestAge > 24 * 60 * 60 * 1000;
}

/**
 * Determine what gate UI to show based on current state.
 *
 * Note: Invite token handling is done in PlanPage.tsx, not here.
 * WaitingRoomGate only handles post-metadata approval states.
 */
type GateDecision =
  | { type: 'allow' }
  | { type: 'auth_required' }
  | { type: 'request_expired' }
  | { type: 'waiting_room' }
  | { type: 'access_denied' };

function determineGateDecision(params: {
  isSnapshot: boolean;
  isLocalViewing: boolean;
  requiresApproval: boolean;
  githubIdentity: GitHubIdentity | null;
  isPending: boolean;
  isRejected: boolean;
  isRequestExpired: boolean;
}): GateDecision {
  const {
    isSnapshot,
    isLocalViewing,
    requiresApproval,
    githubIdentity,
    isPending,
    isRejected,
    isRequestExpired,
  } = params;

  /** Snapshots are always viewable */
  if (isSnapshot) return { type: 'allow' };

  /** Local viewing (connected to hub) bypasses auth */
  if (isLocalViewing) return { type: 'allow' };

  /** No approval required */
  if (!requiresApproval) return { type: 'allow' };

  /** Standard auth check */
  if (!githubIdentity) return { type: 'auth_required' };

  /** Check for expired request */
  if (isRequestExpired) return { type: 'request_expired' };

  if (isPending) return { type: 'waiting_room' };
  if (isRejected) return { type: 'access_denied' };

  return { type: 'allow' };
}

/**
 * Gates access to plan content based on user's approval status.
 * Shows auth prompt for unauthenticated users, waiting room for pending users,
 * and access denied for rejected users.
 *
 * Approval status is read directly from Y.Doc CRDT metadata:
 * - approvedUsers: string[] - List of approved user IDs
 * - rejectedUsers: string[] - List of rejected user IDs
 * - ownerId: string - Plan owner (always approved)
 *
 * This approach is more reliable than signaling server state because:
 * - Y.Doc is the single source of truth
 * - Syncs automatically via WebRTC P2P
 * - Works offline with IndexedDB persistence
 *
 * Note: Invite token redemption is handled in PlanPage.tsx, not here.
 * By the time WaitingRoomGate renders, metadata must exist and any
 * invite redemption has already been processed.
 */
export function WaitingRoomGate({
  ydoc,
  syncState,
  metadata,
  githubIdentity,
  rtcProvider,
  onStartAuth,
  children,
  planId,
  isSnapshot,
}: WaitingRoomGateProps) {
  /*
   * Read approval status directly from Y.Doc CRDT
   * IMPORTANT: All hooks must be called before any early returns
   */
  const {
    status: approvalStatus,
    isPending,
    isRejected,
    requiresApproval,
    ownerId,
  } = useYDocApprovalStatus(ydoc, githubIdentity?.username ?? null);

  /** Broadcast approval status to WebRTC awareness so owners can see pending users */
  const isOwner = !!(githubIdentity && ownerId && githubIdentity.username === ownerId);
  useBroadcastApprovalStatus({
    rtcProvider,
    githubIdentity,
    approvalStatus,
    isOwner,
    planId,
  });

  const isRequestExpired = useMemo(
    () => checkRequestExpired(isPending, rtcProvider),
    [isPending, rtcProvider]
  );

  const isLocalViewing = syncState.hubConnected && syncState.synced;

  const decision = determineGateDecision({
    isSnapshot,
    isLocalViewing,
    requiresApproval,
    githubIdentity,
    isPending,
    isRejected,
    isRequestExpired,
  });

  switch (decision.type) {
    case 'allow':
      return <>{children}</>;
    case 'auth_required':
      return <AuthRequired title={metadata.title} onStartAuth={onStartAuth} />;
    case 'request_expired':
      return <RequestExpired title={metadata.title} onRetry={() => window.location.reload()} />;
    case 'waiting_room':
      return <WaitingRoom title={metadata.title} ownerId={ownerId} />;
    case 'access_denied':
      return <AccessDenied title={metadata.title} />;
    default:
      return assertNever(decision);
  }
}

interface RequestExpiredProps {
  title: string;
  onRetry: () => void;
}

function RequestExpired({ title, onRetry }: RequestExpiredProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Clock className="w-12 h-12 text-warning" />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">Request Expired</h1>

        <p className="text-muted-foreground mb-4">
          Your access request for <span className="font-medium">{title}</span> has expired.
        </p>

        <p className="text-sm text-muted-foreground mb-6">
          Access requests expire after 24 hours. Click below to request access again.
        </p>

        <Button onPress={onRetry} variant="primary" className="w-full">
          Request Access Again
        </Button>
      </div>
    </div>
  );
}

interface WaitingRoomProps {
  title: string;
  ownerId: string | null;
}

function WaitingRoom({ title, ownerId }: WaitingRoomProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="animate-spin">
            <Loader2 className="w-12 h-12 text-primary" />
          </div>
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>

        {ownerId && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
            <User className="w-4 h-4" />
            <span>Owner: {ownerId.slice(0, 8)}...</span>
          </div>
        )}

        <p className="text-muted-foreground mb-6">Waiting for approval...</p>

        <p className="text-sm text-muted-foreground">
          The task owner will be notified of your request. You can close this tab to cancel.
        </p>
      </div>
    </div>
  );
}

interface AccessDeniedProps {
  title: string;
}

function AccessDenied({ title }: AccessDeniedProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <ShieldX className="w-12 h-12 text-danger" />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">Access Denied</h1>

        <p className="text-muted-foreground mb-4">
          Your request to access <span className="font-medium">{title}</span> was denied.
        </p>

        <p className="text-sm text-muted-foreground">
          The task owner has denied your access request.
        </p>
      </div>
    </div>
  );
}

interface AuthRequiredProps {
  title: string;
  onStartAuth: () => void;
}

function AuthRequired({ title, onStartAuth }: AuthRequiredProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <LogIn className="w-12 h-12 text-primary" />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">Authentication Required</h1>

        <p className="text-muted-foreground mb-4">
          You need to sign in to request access to <span className="font-medium">{title}</span>.
        </p>

        <p className="text-sm text-muted-foreground mb-6">
          After signing in with GitHub, the task owner will be notified of your access request.
        </p>

        <Button onPress={() => onStartAuth()} variant="primary" className="w-full">
          <LogIn className="w-4 h-4" />
          Sign in with GitHub
        </Button>
      </div>
    </div>
  );
}
