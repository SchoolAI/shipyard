/**
 * WaitingRoomGate - Gates access to task content based on user's approval status.
 *
 * Shows auth prompt for unauthenticated users, waiting room for pending users,
 * and access denied for rejected users.
 *
 * Approval status is read directly from Loro CRDT metadata:
 * - approvedUsers: string[] - List of approved user IDs
 * - rejectedUsers: string[] - List of rejected user IDs
 * - ownerId: string - Task owner (always approved)
 * - approvalRequired: boolean - Whether approval is required
 */

import { Button, Card, Spinner } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Clock, LogIn, ShieldX, User } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useApprovalStatus } from '@/hooks/use-approval-status';

/** Helper function for exhaustive switch checking */
function assertNever(value: never): never {
  throw new Error(`Unhandled gate decision: ${JSON.stringify(value)}`);
}

interface WaitingRoomGateProps {
  taskId: TaskId;
  /** Current user's ID (GitHub username or local identity), null if not authenticated */
  userId: string | null;
  /** Task title for display */
  title: string;
  /** Callback to start authentication flow */
  onStartAuth: () => void;
  /** Content to show when user has access */
  children: ReactNode;
  /** Whether this is a snapshot URL (snapshots bypass auth) */
  isSnapshot?: boolean;
  /** Whether the user is viewing locally (connected to local MCP server, bypasses auth) */
  isLocalViewing?: boolean;
  /** Request timestamp for expiration check */
  requestedAt?: number | null;
}

/**
 * Check if a pending request has expired (over 24 hours old).
 */
function checkRequestExpired(requestedAt: number | null | undefined): boolean {
  if (!requestedAt) return false;
  const REQUEST_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  const requestAge = Date.now() - requestedAt;
  return requestAge > REQUEST_EXPIRY_MS;
}

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
  userId: string | null;
  isPending: boolean;
  isRejected: boolean;
  isRequestExpired: boolean;
}): GateDecision {
  const {
    isSnapshot,
    isLocalViewing,
    requiresApproval,
    userId,
    isPending,
    isRejected,
    isRequestExpired,
  } = params;

  // Snapshots are always viewable
  if (isSnapshot) return { type: 'allow' };

  // Local viewing (connected to MCP server) bypasses auth
  if (isLocalViewing) return { type: 'allow' };

  // No approval required
  if (!requiresApproval) return { type: 'allow' };

  // Standard auth check
  if (!userId) return { type: 'auth_required' };

  // Check for expired request
  if (isRequestExpired) return { type: 'request_expired' };

  if (isPending) return { type: 'waiting_room' };
  if (isRejected) return { type: 'access_denied' };

  return { type: 'allow' };
}

export function WaitingRoomGate({
  taskId,
  userId,
  title,
  onStartAuth,
  children,
  isSnapshot = false,
  isLocalViewing = false,
  requestedAt,
}: WaitingRoomGateProps) {
  const { isPending, isRejected, requiresApproval, ownerId } = useApprovalStatus(taskId, userId);

  const isRequestExpired = useMemo(() => checkRequestExpired(requestedAt), [requestedAt]);

  const decision = determineGateDecision({
    isSnapshot,
    isLocalViewing,
    requiresApproval,
    userId,
    isPending,
    isRejected,
    isRequestExpired,
  });

  switch (decision.type) {
    case 'allow':
      return <>{children}</>;
    case 'auth_required':
      return <AuthRequired title={title} onStartAuth={onStartAuth} />;
    case 'request_expired':
      return <RequestExpired title={title} onRetry={() => window.location.reload()} />;
    case 'waiting_room':
      return <WaitingRoom title={title} ownerId={ownerId} />;
    case 'access_denied':
      return <AccessDenied title={title} />;
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
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <Card.Header className="flex flex-col items-center gap-4">
          <Clock className="h-12 w-12 text-warning" />
          <Card.Title>Request Expired</Card.Title>
          <Card.Description>
            Your access request for <span className="font-medium">{title}</span> has expired.
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <p className="text-sm text-muted">
            Access requests expire after 24 hours. Click below to request access again.
          </p>
        </Card.Content>

        <Card.Footer className="flex justify-center">
          <Button onPress={onRetry} className="w-full">
            Request Access Again
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}

interface WaitingRoomProps {
  title: string;
  ownerId: string | null;
}

function WaitingRoom({ title, ownerId }: WaitingRoomProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <Card.Header className="flex flex-col items-center gap-4">
          <Spinner size="lg" color="accent" />
          <Card.Title>{title}</Card.Title>
        </Card.Header>

        {ownerId && (
          <Card.Content>
            <div className="flex items-center justify-center gap-2 text-sm text-muted">
              <User className="h-4 w-4" />
              <span>Owner: {ownerId.slice(0, 8)}...</span>
            </div>
          </Card.Content>
        )}

        <Card.Footer className="flex flex-col gap-2 text-center">
          <p className="text-muted">Waiting for approval...</p>
          <p className="text-sm text-muted">
            The task owner will be notified of your request. You can close this tab to cancel.
          </p>
        </Card.Footer>
      </Card>
    </div>
  );
}

interface AccessDeniedProps {
  title: string;
}

function AccessDenied({ title }: AccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <Card.Header className="flex flex-col items-center gap-4">
          <ShieldX className="h-12 w-12 text-danger" />
          <Card.Title>Access Denied</Card.Title>
          <Card.Description>
            Your request to access <span className="font-medium">{title}</span> was denied.
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <p className="text-sm text-muted">The task owner has denied your access request.</p>
        </Card.Content>
      </Card>
    </div>
  );
}

interface AuthRequiredProps {
  title: string;
  onStartAuth: () => void;
}

function AuthRequired({ title, onStartAuth }: AuthRequiredProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <Card.Header className="flex flex-col items-center gap-4">
          <LogIn className="h-12 w-12 text-accent" />
          <Card.Title>Authentication Required</Card.Title>
          <Card.Description>
            You need to sign in to request access to <span className="font-medium">{title}</span>.
          </Card.Description>
        </Card.Header>

        <Card.Content>
          <p className="text-sm text-muted">
            After signing in with GitHub, the task owner will be notified of your access request.
          </p>
        </Card.Content>

        <Card.Footer className="flex justify-center">
          <Button onPress={onStartAuth} className="w-full">
            <LogIn className="h-4 w-4" />
            Sign in with GitHub
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
