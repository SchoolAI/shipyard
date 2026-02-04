/**
 * Hook to manage authentication state for the Kanban board.
 * Consolidates GitHub auth, local auth, identity computation, and auth modal state.
 */

import { useCallback, useState } from 'react';
import { type AuthState, type GitHubIdentity, useGitHubAuth } from '@/hooks/useGitHubAuth';
import { type LocalIdentity, useLocalIdentity } from '@/hooks/useLocalIdentity';
import { colorFromString } from '@/utils/color';

/** Unified identity for comments and attribution */
export interface KanbanIdentity {
  id: string;
  name: string;
  color: string;
}

/** Return type for the useKanbanAuth hook */
export interface UseKanbanAuthReturn {
  /** GitHub identity (null if not signed in) */
  githubIdentity: GitHubIdentity | null;
  /** Local identity (null if not set) */
  localIdentity: LocalIdentity | null;
  /** Unified identity for comments - Priority: GitHub > Local > null */
  identity: KanbanIdentity | null;
  /** Current auth state for GitHub OAuth flow */
  authState: AuthState;
  /** Start GitHub auth flow */
  startAuth: (forceAccountPicker?: boolean) => void;
  /** Whether auth choice modal is open */
  showAuthChoice: boolean;
  /** Set auth choice modal visibility */
  setShowAuthChoice: (show: boolean) => void;
  /** Whether local sign-in modal is open */
  showLocalSignIn: boolean;
  /** Set local sign-in modal visibility */
  setShowLocalSignIn: (show: boolean) => void;
  /** Callback to request identity (opens auth choice modal) */
  handleRequestIdentity: () => void;
  /** Callback to handle local sign-in */
  handleLocalSignIn: (username: string) => void;
}

/**
 * Hook for managing authentication state on the Kanban board.
 * Provides unified identity, auth modals, and auth callbacks.
 */
export function useKanbanAuth(): UseKanbanAuthReturn {
  const { identity: githubIdentity, startAuth, authState } = useGitHubAuth();
  const { localIdentity, setLocalIdentity } = useLocalIdentity();

  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);

  /** Compute unified identity - Priority: GitHub > Local > null */
  const identity: KanbanIdentity | null = githubIdentity
    ? {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      }
    : localIdentity
      ? {
          id: `local:${localIdentity.username}`,
          name: localIdentity.username,
          color: colorFromString(localIdentity.username),
        }
      : null;

  const handleRequestIdentity = useCallback(() => {
    setShowAuthChoice(true);
  }, []);

  const handleLocalSignIn = useCallback(
    (username: string) => {
      setLocalIdentity(username);
      setShowLocalSignIn(false);
    },
    [setLocalIdentity]
  );

  return {
    githubIdentity,
    localIdentity,
    identity,
    authState,
    startAuth,
    showAuthChoice,
    setShowAuthChoice,
    showLocalSignIn,
    setShowLocalSignIn,
    handleRequestIdentity,
    handleLocalSignIn,
  };
}
