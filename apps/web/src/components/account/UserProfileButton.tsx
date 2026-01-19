import { Avatar, Chip, Spinner } from '@heroui/react';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';

interface UserProfileButtonProps {
  identity: GitHubIdentity;
  isValidating: boolean;
  collapsed?: boolean;
  isGitHubAuth: boolean;
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

export function UserProfileButton({
  identity,
  isValidating,
  collapsed,
  isGitHubAuth,
}: UserProfileButtonProps) {
  if (collapsed) {
    return (
      <div className="relative">
        <AvatarRoot size="sm" className={isValidating ? 'opacity-50' : ''}>
          <AvatarImage src={identity.avatarUrl} alt={identity.username} />
          <AvatarFallback>{identity.username[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </AvatarRoot>
        {!isGitHubAuth && (
          <Chip
            size="sm"
            className="absolute -bottom-0.5 -right-1 border-2 border-surface px-0.5 h-4 text-[9px] leading-none"
            color="warning"
            variant="soft"
          >
            Local
          </Chip>
        )}
        {isValidating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-elevated transition-colors w-full">
      <div className="relative">
        <AvatarRoot size="sm" className={isValidating ? 'opacity-50' : ''}>
          <AvatarImage src={identity.avatarUrl} alt={identity.username} />
          <AvatarFallback>{identity.username[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </AvatarRoot>
        {!isGitHubAuth && (
          <Chip
            size="sm"
            className="absolute -bottom-0.5 -right-1 border-2 border-surface px-0.5 h-4 text-[9px] leading-none"
            color="warning"
            variant="soft"
          >
            Local
          </Chip>
        )}
      </div>
      <span className="text-sm truncate flex-1 text-left">{identity.username}</span>
      {isValidating && <Spinner size="sm" />}
    </div>
  );
}
