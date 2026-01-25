import { Button } from '@heroui/react';
import type { PlanMetadata } from '@shipyard/schema';
import { Clock, Loader2, LogIn, ShieldX, TicketX, User } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { useBroadcastApprovalStatus } from '@/hooks/useBroadcastApprovalStatus';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import { type RedemptionState, useInviteToken } from '@/hooks/useInviteToken';
import type { SyncState } from '@/hooks/useMultiProviderSync';
import { useYDocApprovalStatus } from '@/hooks/useYDocApprovalStatus';
import { isPlanAwarenessState } from '@/types/awareness';

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
 * Returns null if access should be granted.
 */
type GateDecision =
  | { type: 'allow' }
  | { type: 'redeeming' }
  | { type: 'invite_error'; error: InviteErrorProps['error'] }
  | { type: 'auth_for_invite' }
  | { type: 'auth_required' }
  | { type: 'request_expired' }
  | { type: 'waiting_room' }
  | { type: 'access_denied' };

function determineGateDecision(params: {
  isSnapshot: boolean;
  isLocalViewing: boolean;
  requiresApproval: boolean;
  hasInviteToken: boolean;
  redemptionState: RedemptionState;
  githubIdentity: GitHubIdentity | null;
  isPending: boolean;
  isRejected: boolean;
  isRequestExpired: boolean;
}): GateDecision {
  const {
    isSnapshot,
    isLocalViewing,
    requiresApproval,
    hasInviteToken,
    redemptionState,
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

  /** Handle invite token states FIRST */
  if (hasInviteToken && redemptionState.status === 'redeeming') {
    return { type: 'redeeming' };
  }

  if (redemptionState.status === 'error') {
    return { type: 'invite_error', error: redemptionState.error };
  }

  if (hasInviteToken && !githubIdentity) {
    return { type: 'auth_for_invite' };
  }

  /** Invite successfully redeemed - wait for CRDT sync */
  if (redemptionState.status === 'success') {
    return isPending ? { type: 'redeeming' } : { type: 'allow' };
  }

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
 * Also handles invite token redemption - users with valid invite tokens
 * are auto-approved without manual owner approval.
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

  const { redemptionState, hasInviteToken, clearInviteToken } = useInviteToken(
    metadata.id,
    rtcProvider,
    githubIdentity
  );

  const isRequestExpired = useMemo(
    () => checkRequestExpired(isPending, rtcProvider),
    [isPending, rtcProvider]
  );

  const isLocalViewing = syncState.hubConnected && syncState.synced;

  const decision = determineGateDecision({
    isSnapshot,
    isLocalViewing,
    requiresApproval,
    hasInviteToken,
    redemptionState,
    githubIdentity,
    isPending,
    isRejected,
    isRequestExpired,
  });

  switch (decision.type) {
    case 'allow':
      return <>{children}</>;
    case 'redeeming':
      return <RedeemingInvite title={metadata.title} />;
    case 'invite_error':
      return (
        <InviteError
          title={metadata.title}
          error={decision.error}
          onDismiss={clearInviteToken}
          onStartAuth={onStartAuth}
        />
      );
    case 'auth_for_invite':
      return <AuthRequiredForInvite title={metadata.title} onStartAuth={onStartAuth} />;
    case 'auth_required':
      return <AuthRequired title={metadata.title} onStartAuth={onStartAuth} />;
    case 'request_expired':
      return <RequestExpired title={metadata.title} onRetry={() => window.location.reload()} />;
    case 'waiting_room':
      return <WaitingRoom title={metadata.title} ownerId={ownerId} />;
    case 'access_denied':
      return <AccessDenied title={metadata.title} />;
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

/** --- Invite Token UI Components --- */

interface RedeemingInviteProps {
  title: string;
}

function RedeemingInvite({ title }: RedeemingInviteProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="animate-spin">
            <Loader2 className="w-12 h-12 text-primary" />
          </div>
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">Joining Task</h1>

        <p className="text-muted-foreground">
          Activating your invite link for <span className="font-medium">{title}</span>...
        </p>
      </div>
    </div>
  );
}

interface AuthRequiredForInviteProps {
  title: string;
  onStartAuth: () => void;
}

function AuthRequiredForInvite({ title, onStartAuth }: AuthRequiredForInviteProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <LogIn className="w-12 h-12 text-primary" />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">Sign In to Join</h1>

        <p className="text-muted-foreground mb-4">
          You have an invite link for <span className="font-medium">{title}</span>.
        </p>

        <p className="text-sm text-muted-foreground mb-6">
          Sign in with GitHub to activate your invite and gain instant access.
        </p>

        <Button onPress={() => onStartAuth()} variant="primary" className="w-full">
          <LogIn className="w-4 h-4" />
          Sign in with GitHub
        </Button>
      </div>
    </div>
  );
}

interface InviteErrorProps {
  title: string;
  error: 'expired' | 'exhausted' | 'revoked' | 'invalid' | 'already_redeemed' | undefined;
  onDismiss: () => void;
  onStartAuth: () => void;
}

const INVITE_ERROR_DEFAULT = {
  heading: 'Invalid Invite Link',
  message: 'This invite link is invalid. Please check the URL and try again.',
  icon: TicketX,
} as const;

const INVITE_ERROR_MESSAGES: Record<
  string,
  { heading: string; message: string; icon: typeof TicketX }
> = {
  expired: {
    heading: 'Invite Link Expired',
    message: 'This invite link has expired. Please ask the task owner for a new link.',
    icon: Clock,
  },
  exhausted: {
    heading: 'Invite Link Used',
    message:
      'This invite link has reached its maximum number of uses. Please ask the task owner for a new link.',
    icon: TicketX,
  },
  revoked: {
    heading: 'Invite Link Revoked',
    message: 'This invite link has been revoked by the task owner.',
    icon: ShieldX,
  },
  invalid: INVITE_ERROR_DEFAULT,
  already_redeemed: {
    heading: 'Already Joined',
    message: "You've already used this invite link. Try refreshing the page.",
    icon: TicketX,
  },
};

function InviteError({ title, error, onDismiss, onStartAuth }: InviteErrorProps) {
  const errorInfo = INVITE_ERROR_MESSAGES[error ?? 'invalid'] ?? INVITE_ERROR_DEFAULT;
  const Icon = errorInfo.icon;

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="bg-surface border border-separator rounded-lg p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Icon className="w-12 h-12 text-danger" />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">{errorInfo.heading}</h1>

        <p className="text-muted-foreground mb-2">
          Could not join <span className="font-medium">{title}</span>.
        </p>

        <p className="text-sm text-muted-foreground mb-6">{errorInfo.message}</p>

        <div className="flex flex-col gap-2">
          <Button onPress={onDismiss} variant="secondary" className="w-full">
            Request Manual Access
          </Button>
          <Button onPress={onStartAuth} variant="ghost" size="sm" className="w-full">
            Try Different Account
          </Button>
        </div>
      </div>
    </div>
  );
}
