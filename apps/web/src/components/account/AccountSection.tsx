import { useState } from 'react';
import { AuthChoiceModal } from '@/components/AuthChoiceModal';
import { GitHubAuthOverlay } from '@/components/GitHubAuthModal';
import { SignInModal } from '@/components/SignInModal';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useLocalIdentity } from '@/hooks/useLocalIdentity';
import { SignInButton } from './SignInButton';
import { UserMenu } from './UserMenu';

interface AccountSectionProps {
  collapsed?: boolean;
}

export function AccountSection({ collapsed = false }: AccountSectionProps) {
  const { identity, isValidating, authState, startAuth, clearAuth } = useGitHubAuth();
  const { setLocalIdentity } = useLocalIdentity();
  const [showAuthChoice, setShowAuthChoice] = useState(false);
  const [showLocalSignIn, setShowLocalSignIn] = useState(false);

  const handleSwitchAccount = () => {
    clearAuth();
    startAuth(true);
  };

  const handleLocalSignIn = (username: string) => {
    setLocalIdentity(username);
    setShowLocalSignIn(false);
  };

  if (!identity) {
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
        identity={identity}
        isValidating={isValidating}
        collapsed={collapsed}
        onSignOut={clearAuth}
        onSwitchAccount={handleSwitchAccount}
      />
      <GitHubAuthOverlay authState={authState} />
    </>
  );
}
