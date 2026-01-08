import { useEffect, useState } from 'react';
import { GitHubAuthModal } from '@/components/GitHubAuthModal';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { SignInButton } from './SignInButton';
import { UserMenu } from './UserMenu';

interface AccountSectionProps {
  collapsed?: boolean;
}

export function AccountSection({ collapsed = false }: AccountSectionProps) {
  const { identity, isValidating, authState, startAuth, clearAuth, cancelAuth } = useGitHubAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (authState.status === 'polling' || authState.status === 'awaiting_code') {
      setShowAuthModal(true);
    }
  }, [authState.status]);

  useEffect(() => {
    if (authState.status === 'success') {
      const timer = setTimeout(() => {
        setShowAuthModal(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return;
  }, [authState.status]);

  const handleSignIn = () => {
    startAuth();
    setShowAuthModal(true);
  };

  const handleCancel = () => {
    cancelAuth();
    setShowAuthModal(false);
  };

  const handleSwitchAccount = () => {
    clearAuth();
    startAuth();
    setShowAuthModal(true);
  };

  if (!identity) {
    return (
      <>
        <SignInButton collapsed={collapsed} onPress={handleSignIn} />
        <GitHubAuthModal
          isOpen={showAuthModal}
          onOpenChange={setShowAuthModal}
          authState={authState}
          onStartAuth={startAuth}
          onCancel={handleCancel}
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
      <GitHubAuthModal
        isOpen={showAuthModal}
        onOpenChange={setShowAuthModal}
        authState={authState}
        onStartAuth={startAuth}
        onCancel={handleCancel}
      />
    </>
  );
}
