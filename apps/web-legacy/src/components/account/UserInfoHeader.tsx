import { Chip } from '@heroui/react';
import { Avatar } from '@/components/ui/avatar';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';

interface UserInfoHeaderProps {
  identity: GitHubIdentity;
  isGitHubAuth: boolean;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function UserInfoHeader({ identity, isGitHubAuth }: UserInfoHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar size="md">
            <Avatar.Image src={identity.avatarUrl} alt={identity.username} />
            <Avatar.Fallback>
              {getInitials(identity.displayName || identity.username)}
            </Avatar.Fallback>
          </Avatar>
          {!isGitHubAuth && (
            <Chip
              size="sm"
              className="absolute -bottom-0.5 -right-1.5 border-2 border-surface px-0.5 h-4 text-[9px] leading-none"
              color="warning"
              variant="soft"
            >
              Local
            </Chip>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">
            {identity.displayName || identity.username}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {isGitHubAuth ? `@${identity.username}` : 'Local Account'}
          </span>
        </div>
      </div>
    </div>
  );
}
