import { Button } from '@heroui/react';
import { getPlanOwnerId, type PlanMetadata } from '@peer-plan/schema';
import { Loader2, LogIn, ShieldX, User } from 'lucide-react';
import type { ReactNode } from 'react';
import type * as Y from 'yjs';
import { useApprovalStatus } from '@/hooks/useApprovalStatus';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import type { SyncState } from '@/hooks/useMultiProviderSync';

interface WaitingRoomGateProps {
  ydoc: Y.Doc;
  syncState: SyncState;
  metadata: PlanMetadata;
  githubIdentity: GitHubIdentity | null;
  onStartAuth: () => void;
  children: ReactNode;
}

/**
 * Gates access to plan content based on user's approval status.
 * Shows auth prompt for unauthenticated users, waiting room for pending users,
 * and access denied for rejected users.
 */
export function WaitingRoomGate({
  ydoc,
  syncState,
  metadata,
  githubIdentity,
  onStartAuth,
  children,
}: WaitingRoomGateProps) {
  const { isPending, isRejected, requiresApproval } = useApprovalStatus(syncState);

  if (!requiresApproval) {
    return <>{children}</>;
  }

  // Show auth prompt if user needs to authenticate to access this plan
  if (!githubIdentity) {
    return <AuthRequired title={metadata.title} onStartAuth={onStartAuth} />;
  }

  if (isPending) {
    return <WaitingRoom title={metadata.title} ownerId={getPlanOwnerId(ydoc)} />;
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
