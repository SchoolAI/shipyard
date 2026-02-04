/**
 * ApprovalPanel - Shows pending access requests for task owners.
 *
 * Displays as a popover triggered by a badge in the header.
 * Uses Loro ephemeral presence to track connected peers and
 * Loro CRDT metadata for approval state.
 */

import { Button, Popover } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Check, Clock, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useP2PPeers, type ConnectedPeer } from '@/hooks/use-p2p-peers';
import { useTaskMeta } from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';

const MAX_DISPLAYED_PENDING_USERS = 20;

interface PendingUser {
  id: string;
  name: string;
  color: string;
  requestedAt: number;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return 'over a day ago';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Extract pending users from connected peers.
 * A user is pending if they're connected but not in approvedUsers or rejectedUsers.
 */
function getPendingUsers(
  connectedPeers: ConnectedPeer[],
  approvedUsers: string[],
  rejectedUsers: string[],
  ownerId: string | null
): PendingUser[] {
  const approvedSet = new Set(approvedUsers);
  const rejectedSet = new Set(rejectedUsers);

  return connectedPeers
    .filter((peer) => {
      // Skip if owner
      if (ownerId && peer.name === ownerId) return false;
      // Skip if already approved or rejected
      if (approvedSet.has(peer.name)) return false;
      if (rejectedSet.has(peer.name)) return false;
      // Skip agents (only show browser users)
      if (peer.platform !== 'browser') return false;
      return true;
    })
    .map((peer) => ({
      id: peer.name,
      name: peer.name,
      color: peer.color,
      requestedAt: peer.connectedAt,
    }));
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
        <Avatar.Fallback style={{ backgroundColor: user.color }}>{getInitials(user.name)}</Avatar.Fallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatTimeAgo(user.requestedAt)}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={() => onApprove(user.id)}
          aria-label={`Approve ${user.name}`}
          className="text-success hover:bg-success/10"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={() => onDeny(user.id)}
          aria-label={`Deny ${user.name}`}
          className="text-danger hover:bg-danger/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface ApprovalPanelProps {
  taskId: TaskId;
}

export function ApprovalPanel({ taskId }: ApprovalPanelProps) {
  const meta = useTaskMeta(taskId);
  const taskDoc = useTaskDocument(taskId);
  const { connectedPeers } = useP2PPeers();
  const { identity: githubIdentity } = useGitHubAuth();

  const currentUsername = githubIdentity?.username ?? null;
  const isOwner = currentUsername && meta.ownerId && currentUsername === meta.ownerId;

  const pendingUsers = useMemo(
    () => getPendingUsers(connectedPeers, meta.approvedUsers, meta.rejectedUsers, meta.ownerId),
    [connectedPeers, meta.approvedUsers, meta.rejectedUsers, meta.ownerId]
  );

  const displayedUsers = pendingUsers.slice(0, MAX_DISPLAYED_PENDING_USERS);
  const hasMoreUsers = pendingUsers.length > MAX_DISPLAYED_PENDING_USERS;
  const hiddenCount = pendingUsers.length - MAX_DISPLAYED_PENDING_USERS;

  const handleApprove = useCallback(
    (userId: string) => {
      const approvedUsers = taskDoc.meta.approvedUsers;
      if (!approvedUsers.toArray().includes(userId)) {
        approvedUsers.push(userId);
      }
      const user = pendingUsers.find((u) => u.id === userId);
      toast.success(`${user?.name ?? userId} approved`, {
        description: 'They now have access to this task.',
      });
    },
    [taskDoc.meta.approvedUsers, pendingUsers]
  );

  const handleDeny = useCallback(
    (userId: string) => {
      const rejectedUsers = taskDoc.meta.rejectedUsers;
      if (!rejectedUsers.toArray().includes(userId)) {
        rejectedUsers.push(userId);
      }
      const user = pendingUsers.find((u) => u.id === userId);
      toast.success(`${user?.name ?? userId} denied`, {
        description: 'They have been denied access.',
      });
    },
    [taskDoc.meta.rejectedUsers, pendingUsers]
  );

  // Only show to task owner
  if (!isOwner) return null;

  // Don't show if no pending users
  if (pendingUsers.length === 0) return null;

  return (
    <Popover>
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5 bg-warning/20 text-warning-foreground hover:bg-warning/30"
        aria-label={`${pendingUsers.length} pending access request${pendingUsers.length === 1 ? '' : 's'}`}
      >
        <UserPlus className="h-4 w-4" />
        <span>{pendingUsers.length}</span>
      </Button>

      <Popover.Content placement="bottom end" className="w-80">
        <Popover.Dialog>
          <Popover.Arrow />
          <Popover.Heading className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Pending Access Requests
          </Popover.Heading>

          <div className="mt-2 max-h-[300px] overflow-y-auto">
            {displayedUsers.map((user) => (
              <PendingUserRow key={user.id} user={user} onApprove={handleApprove} onDeny={handleDeny} />
            ))}

            {hasMoreUsers && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                ... and {hiddenCount} more waiting
              </p>
            )}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
