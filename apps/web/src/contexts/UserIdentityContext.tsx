import { createContext, useContext } from 'react';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';

interface UserIdentityContextValue {
  identity: GitHubIdentity | null;
  actor: string; // Computed: identity?.username || 'Anonymous'
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
}: {
  children: React.ReactNode;
  githubIdentity: GitHubIdentity | null;
}) {
  const actor = githubIdentity?.username || 'Anonymous';

  return (
    <UserIdentityContext.Provider value={{ identity: githubIdentity, actor }}>
      {children}
    </UserIdentityContext.Provider>
  );
}
