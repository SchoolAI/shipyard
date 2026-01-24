import { Button, Popover } from '@heroui/react';
import { approveUser, rejectUser } from '@shipyard/schema';
import { Check, Clock, UserPlus, Users, X } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { Avatar } from '@/components/ui/avatar';
import type { PendingUser } from '@/hooks/usePendingUsers';
import { usePendingUsers } from '@/hooks/usePendingUsers';

// Maximum number of pending users to display in the popover
const MAX_DISPLAYED_PENDING_USERS = 20;

interface ApprovalPanelProps {
  ydoc: Y.Doc;
  rtcProvider: WebrtcProvider | null;
  /** Current user's username - only show panel to owner */
  currentUsername: string | null;
  /** Plan owner's username */
  ownerId: string | null;
  /** Current plan ID for filtering pending users */
  planId: string;
}

/**
 * Returns a human-readable string for how long ago a timestamp was.
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  return 'over a day ago';
}

/**
 * Gets initials from a name (e.g., "John Doe" -> "JD")
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface PendingUserRowProps {
  user: PendingUser;
  onApprove: (userId: string) => void;
  onDeny: (userId: string) => void;
}

function PendingUserRow({ user, onApprove, onDeny }: PendingUserRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar size="sm">
        <Avatar.Image alt={user.name} src={`https://github.com/${user.id}.png?size=64`} />
        <Avatar.Fallback style={{ backgroundColor: user.color }}>
          {getInitials(user.name)}
        </Avatar.Fallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTimeAgo(user.requestedAt)}
        </p>
      </div>

      <div className="flex gap-1 shrink-0">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={() => onApprove(user.id)}
          aria-label={`Approve ${user.name}`}
          className="text-success hover:bg-success/10"
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={() => onDeny(user.id)}
          aria-label={`Deny ${user.name}`}
          className="text-danger hover:bg-danger/10"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Panel showing pending access requests for plan owners.
 * Displays as a popover triggered by a badge in the header.
 */
export function ApprovalPanel({
  ydoc,
  rtcProvider,
  currentUsername,
  ownerId,
  planId,
}: ApprovalPanelProps) {
  const pendingUsers = usePendingUsers(rtcProvider, planId);

  // Only show to plan owner
  const isOwner = currentUsername && ownerId && currentUsername === ownerId;

  // Limit displayed users for performance with large lists
  const displayedUsers = pendingUsers.slice(0, MAX_DISPLAYED_PENDING_USERS);
  const hasMoreUsers = pendingUsers.length > MAX_DISPLAYED_PENDING_USERS;
  const hiddenCount = pendingUsers.length - MAX_DISPLAYED_PENDING_USERS;

  const handleApprove = useCallback(
    (userId: string) => {
      approveUser(ydoc, userId);
      const user = pendingUsers.find((u) => u.id === userId);
      toast.success(`${user?.name ?? userId} approved`, {
        description: 'They now have access to this task.',
      });
    },
    [ydoc, pendingUsers]
  );

  const handleDeny = useCallback(
    (userId: string) => {
      // Reject the user - this adds them to rejectedUsers list
      rejectUser(ydoc, userId);
      const user = pendingUsers.find((u) => u.id === userId);
      toast.info(`${user?.name ?? userId} denied`, {
        description: 'They will see an access denied message.',
      });
    },
    [ydoc, pendingUsers]
  );

  // Don't render if not owner or no pending users
  if (!isOwner || pendingUsers.length === 0) {
    return null;
  }

  return (
    <Popover>
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5"
        aria-label={`${pendingUsers.length} pending access request${pendingUsers.length === 1 ? '' : 's'}`}
      >
        <UserPlus className="w-4 h-4" />
        <span className="text-xs font-semibold bg-warning text-warning-foreground rounded-full px-1.5 min-w-[1.25rem]">
          {pendingUsers.length}
        </span>
      </Button>

      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog>
          <Popover.Arrow />
          <Popover.Heading>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>Access Requests</span>
            </div>
          </Popover.Heading>

          <div className="mt-3 divide-y divide-separator">
            {displayedUsers.map((user) => (
              <PendingUserRow
                key={user.id}
                user={user}
                onApprove={handleApprove}
                onDeny={handleDeny}
              />
            ))}
          </div>

          {hasMoreUsers && (
            <p className="mt-2 text-xs text-muted-foreground text-center">
              and {hiddenCount} more user{hiddenCount > 1 ? 's' : ''} waiting...
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Approved users will immediately gain access to this task.
          </p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
