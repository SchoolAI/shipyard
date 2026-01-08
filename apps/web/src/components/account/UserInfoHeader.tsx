import { AvatarFallback, AvatarImage, AvatarRoot } from '@heroui/react';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';

interface UserInfoHeaderProps {
  identity: GitHubIdentity;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function UserInfoHeader({ identity }: UserInfoHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <AvatarRoot size="md">
          <AvatarImage src={identity.avatarUrl} alt={identity.username} />
          <AvatarFallback>{getInitials(identity.displayName || identity.username)}</AvatarFallback>
        </AvatarRoot>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">
            {identity.displayName || identity.username}
          </span>
          <span className="text-xs text-muted-foreground truncate">@{identity.username}</span>
        </div>
      </div>
    </div>
  );
}
