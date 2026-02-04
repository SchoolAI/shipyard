import { useMemo, useState } from 'react';
import { AuthChoiceModal } from '@/components/auth-choice-modal';
import { GitHubAuthOverlay } from '@/components/github-auth-modal';
import { SignInModal } from '@/components/sign-in-modal';
import { type GitHubIdentity, useGitHubAuth } from '@/hooks/use-github-auth';
import { useLocalIdentity } from '@/hooks/use-local-identity';
import { SignInButton } from './sign-in-button';
import { UserMenu } from './user-menu';

interface AccountSectionProps {
  collapsed?: boolean;
}

export function AccountSection({ collapsed = false }: AccountSectionProps) {
  const {
    identity: githubIdentity,
    isValidating,
    authState,
    startAuth,
    clearAuth,
  } = useGitHubAuth();
  const { localIdentity, setLocalIdentity, clearLocalIdentity } = useLocalIdentity();
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);

  const unifiedIdentity = useMemo((): GitHubIdentity | null => {
    if (githubIdentity) return githubIdentity;
    if (localIdentity) {
      return {
        token: '',
        username: localIdentity.username,
        displayName: localIdentity.username,
        createdAt: localIdentity.createdAt,
        scope: '',
      };
    }
    return null;
  }, [githubIdentity, localIdentity]);

  const handleSwitchAccount = () => {
    clearAuth();
    clearLocalIdentity();
    setShowAuthChoice(true);
  };

  const handleSignOut = () => {
    clearAuth();
    clearLocalIdentity();
  };

  const handleLocalSignIn = (username: string) => {
    setLocalIdentity(username);
    setShowLocalSignIn(false);
  };

  if (!unifiedIdentity) {
    return (
      <>
        <SignInButton collapsed={collapsed} onPress={() => setShowAuthChoice(true)} />
        <GitHubAuthOverlay authState={authState} />
        <AuthChoiceModal
          isOpen={showAuthChoice}
          onOpenChange={setShowAuthChoice}
          onGitHubAuth={startAuth}
          onLocalAuth={() => setShowLocalSignIn(true)}
        />
        <SignInModal
          isOpen={showLocalSignIn}
          onClose={() => setShowLocalSignIn(false)}
          onSignIn={handleLocalSignIn}
        />
      </>
    );
  }

  return (
    <>
      <UserMenu
        identity={unifiedIdentity}
        isValidating={isValidating}
        collapsed={collapsed}
        isGitHubAuth={githubIdentity !== null}
        onSignOut={handleSignOut}
        onSwitchAccount={handleSwitchAccount}
      />
      <GitHubAuthOverlay authState={authState} />
    </>
  );
}
