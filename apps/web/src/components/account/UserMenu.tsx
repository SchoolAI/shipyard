import { Dropdown, Label, Separator } from '@heroui/react';
import { ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import type { Key } from 'react';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import { UserInfoHeader } from './UserInfoHeader';
import { UserProfileButton } from './UserProfileButton';

interface UserMenuProps {
  identity: GitHubIdentity;
  isValidating: boolean;
  collapsed?: boolean;
  onSignOut: () => void;
  onSwitchAccount: () => void;
}

export function UserMenu({
  identity,
  isValidating,
  collapsed,
  onSignOut,
  onSwitchAccount,
}: UserMenuProps) {
  const handleAction = (key: Key) => {
    switch (key) {
      case 'view-profile':
        window.open(`https://github.com/${identity.username}`, '_blank', 'noopener');
        break;
      case 'switch-account':
        onSwitchAccount();
        break;
      case 'sign-out':
        onSignOut();
        break;
    }
  };

  return (
    <Dropdown>
      <Dropdown.Trigger
        className={collapsed ? 'rounded-full' : 'w-full rounded-md'}
        aria-label={`Account menu for ${identity.username}`}
      >
        <UserProfileButton identity={identity} isValidating={isValidating} collapsed={collapsed} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="top start" className="min-w-[220px]">
        <UserInfoHeader identity={identity} />
        <Separator />
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Item id="view-profile" textValue="View GitHub Profile">
            <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
            <Label>View GitHub Profile</Label>
          </Dropdown.Item>
          <Dropdown.Item id="switch-account" textValue="Switch Account">
            <RefreshCw className="w-4 h-4 shrink-0 text-muted-foreground" />
            <Label>Switch Account</Label>
          </Dropdown.Item>
          <Dropdown.Item id="sign-out" textValue="Sign Out" variant="danger">
            <LogOut className="w-4 h-4 shrink-0 text-danger" />
            <Label>Sign Out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
