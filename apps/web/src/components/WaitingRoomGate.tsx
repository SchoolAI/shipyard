import { Button } from '@heroui/react';
import { getPlanOwnerId, type PlanMetadata } from '@peer-plan/schema';
import { Clock, Loader2, LogIn, ShieldX, TicketX, User } from 'lucide-react';
import type { ReactNode } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { useApprovalStatus } from '@/hooks/useApprovalStatus';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import { useInviteToken } from '@/hooks/useInviteToken';
import type { SyncState } from '@/hooks/useMultiProviderSync';

interface WaitingRoomGateProps {
  ydoc: Y.Doc;
  syncState: SyncState;
  metadata: PlanMetadata;
  githubIdentity: GitHubIdentity | null;
  rtcProvider: WebrtcProvider | null;
  onStartAuth: () => void;
  children: ReactNode;
}

/**
 * Gates access to plan content based on user's approval status.
 * Shows auth prompt for unauthenticated users, waiting room for pending users,
 * and access denied for rejected users.
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
}: WaitingRoomGateProps) {
  const { isPending, isRejected } = useApprovalStatus(syncState);
  const { redemptionState, hasInviteToken, clearInviteToken } = useInviteToken(
    metadata.id,
    rtcProvider,
    githubIdentity
  );

  // If connected to local MCP server (WebSocket), skip auth entirely
  // This allows local development without authentication
  // Shared links (P2P only) will still require auth since activeCount === 0
  const isLocalViewing = syncState.activeCount > 0;

  if (isLocalViewing) {
    return <>{children}</>;
  }

  // Read ownerId directly from Y.Doc to determine if approval is required
  // This works even if approvalStatus hasn't been computed yet
  const ownerId = getPlanOwnerId(ydoc);
  const requiresApproval = ownerId !== null;

  if (!requiresApproval) {
    return <>{children}</>;
  }

  // Handle invite token states FIRST (before auth check)
  // This allows showing invite-specific UI

  // If invite redemption is in progress, show redemption UI
  if (hasInviteToken && redemptionState.status === 'redeeming') {
    return <RedeemingInvite title={metadata.title} />;
  }

  // If invite redemption failed, show error
  if (redemptionState.status === 'error') {
    return (
      <InviteError
        title={metadata.title}
        error={redemptionState.error}
        onDismiss={clearInviteToken}
        onStartAuth={onStartAuth}
      />
    );
  }

  // If user has invite but needs to authenticate first
  if (hasInviteToken && !githubIdentity) {
    return <AuthRequiredForInvite title={metadata.title} onStartAuth={onStartAuth} />;
  }

  // If invite was successfully redeemed, show brief success then pass through
  // The user will be approved server-side, so isPending should become false shortly
  if (redemptionState.status === 'success') {
    // Don't block - the approval should propagate via CRDT
    return <>{children}</>;
  }

  // Standard auth check (no invite token)
  if (!githubIdentity) {
    return <AuthRequired title={metadata.title} onStartAuth={onStartAuth} />;
  }

  if (isPending) {
    return <WaitingRoom title={metadata.title} ownerId={ownerId} />;
  }

  if (isRejected) {
    return <AccessDenied title={metadata.title} />;
  }

  return <>{children}</>;
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
          The plan owner will be notified of your request. You can close this tab to cancel.
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
          The plan owner has denied your access request.
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
          After signing in with GitHub, the plan owner will be notified of your access request.
        </p>

        <Button onPress={() => onStartAuth()} variant="primary" className="w-full">
          <LogIn className="w-4 h-4" />
          Sign in with GitHub
        </Button>
      </div>
    </div>
  );
}

// --- Invite Token UI Components ---

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

        <h1 className="text-xl font-semibold text-foreground mb-2">Joining Plan</h1>

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

function InviteError({ title, error, onDismiss, onStartAuth }: InviteErrorProps) {
  const defaultError = {
    heading: 'Invalid Invite Link',
    message: 'This invite link is invalid. Please check the URL and try again.',
    icon: TicketX,
  } as const;

  const errorMessages: Record<string, { heading: string; message: string; icon: typeof TicketX }> =
    {
      expired: {
        heading: 'Invite Link Expired',
        message: 'This invite link has expired. Please ask the plan owner for a new link.',
        icon: Clock,
      },
      exhausted: {
        heading: 'Invite Link Used',
        message:
          'This invite link has reached its maximum number of uses. Please ask the plan owner for a new link.',
        icon: TicketX,
      },
      revoked: {
        heading: 'Invite Link Revoked',
        message: 'This invite link has been revoked by the plan owner.',
        icon: ShieldX,
      },
      invalid: defaultError,
      already_redeemed: {
        heading: 'Already Joined',
        message: "You've already used this invite link. Try refreshing the page.",
        icon: TicketX,
      },
    };

  const errorInfo = errorMessages[error ?? 'invalid'] ?? defaultError;
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
