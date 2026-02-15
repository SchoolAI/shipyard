import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { ExternalLink, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../stores';

function Avatar({ username, size = 'md' }: { username: string; size?: 'sm' | 'md' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const dims = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-full bg-accent/20 text-accent font-semibold uppercase shrink-0 overflow-hidden ${dims}`}
    >
      {imgFailed ? (
        username.charAt(0)
      ) : (
        <img
          src={`https://github.com/${username}.png?size=64`}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
    </span>
  );
}

export function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const handleAction = (key: React.Key) => {
    if (key === 'github-profile') {
      window.open(`https://github.com/${user.username}`, '_blank', 'noopener');
    } else if (key === 'sign-out') {
      logout();
    }
  };

  const trigger = collapsed ? (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={`${user.username} menu`}
          className="text-muted hover:text-foreground hover:bg-default/50 w-8 h-8 min-w-0"
        >
          <Avatar username={user.username} size="sm" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="right">{user.username}</Tooltip.Content>
    </Tooltip>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start text-muted hover:text-foreground hover:bg-default/30 gap-2 flex-1 h-9 min-w-0 px-2"
      aria-label={`${user.username} menu`}
    >
      <Avatar username={user.username} />
      <span className="text-sm truncate">{user.username}</span>
    </Button>
  );

  return (
    <Dropdown>
      {trigger}
      <Dropdown.Popover placement={collapsed ? 'right' : 'top start'} className="min-w-[180px]">
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Item id="github-profile" textValue="View GitHub Profile">
            <ExternalLink className="w-4 h-4" />
            <Label>View GitHub Profile</Label>
          </Dropdown.Item>
          <Dropdown.Item id="sign-out" textValue="Sign Out" className="text-danger">
            <LogOut className="w-4 h-4" />
            <Label>Sign Out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
