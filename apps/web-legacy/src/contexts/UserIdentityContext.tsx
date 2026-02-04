import { createContext, useContext } from 'react';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import type { LocalIdentity } from '@/hooks/useLocalIdentity';

interface UserIdentityContextValue {
  identity: GitHubIdentity | null;
  localIdentity: LocalIdentity | null;
  actor: string;
  hasIdentity: boolean;
  canAccessPrivateRepos: boolean;
}

const UserIdentityContext = createContext<UserIdentityContextValue | null>(null);

export function useUserIdentity() {
  const context = useContext(UserIdentityContext);
  if (!context) {
    throw new Error('useUserIdentity must be used within UserIdentityProvider');
  }
  return context;
}

export function UserIdentityProvider({
  children,
  githubIdentity,
  localIdentity,
}: {
  children: React.ReactNode;
  githubIdentity: GitHubIdentity | null;
  localIdentity: LocalIdentity | null;
}) {
  /** Priority: GitHub > Local (prefixed) > Anonymous */
  const actor = githubIdentity?.username
    ? githubIdentity.username
    : localIdentity?.username
      ? `local:${localIdentity.username}`
      : 'Anonymous';

  const hasIdentity = githubIdentity !== null || localIdentity !== null;
  const canAccessPrivateRepos = githubIdentity?.scope?.includes('repo') ?? false;

  return (
    <UserIdentityContext.Provider
      value={{
        identity: githubIdentity,
        localIdentity,
        actor,
        hasIdentity,
        canAccessPrivateRepos,
      }}
    >
      {children}
    </UserIdentityContext.Provider>
  );
}
