import { GitHubAuthOverlay } from '@/components/GitHubAuthModal';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { SignInButton } from './SignInButton';
import { UserMenu } from './UserMenu';

interface AccountSectionProps {
  collapsed?: boolean;
}

export function AccountSection({ collapsed = false }: AccountSectionProps) {
  const { identity, isValidating, authState, startAuth, clearAuth } = useGitHubAuth();

  const handleSwitchAccount = () => {
    clearAuth();
    startAuth(true);
  };

  if (!identity) {
    return (
      <>
        <SignInButton collapsed={collapsed} onPress={startAuth} />
        <GitHubAuthOverlay authState={authState} />
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
