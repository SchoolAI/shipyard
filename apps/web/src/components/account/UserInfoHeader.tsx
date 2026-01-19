import { Avatar, Chip } from '@heroui/react';
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

// Note: Avatar compound components have type issues in HeroUI v3 beta
// Using type assertions until types are fixed in stable release
const AvatarRoot = Avatar as unknown as React.FC<{
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}>;
const AvatarImage = Avatar.Image as React.FC<{ src?: string; alt: string }>;
const AvatarFallback = Avatar.Fallback as React.FC<{ children: React.ReactNode }>;

export function UserInfoHeader({ identity, isGitHubAuth }: UserInfoHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <div className="relative">
          <AvatarRoot size="md">
            <AvatarImage src={identity.avatarUrl} alt={identity.username} />
            <AvatarFallback>
              {getInitials(identity.displayName || identity.username)}
            </AvatarFallback>
          </AvatarRoot>
          {!isGitHubAuth && (
            <Chip
              size="sm"
              className="absolute -bottom-0.5 -right-0.5 border-2 border-surface px-0.5 h-4 text-[9px] leading-none"
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
