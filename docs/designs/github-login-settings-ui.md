# Design: GitHub Login Flow and Settings UI

**Status**: Design
**Created**: 2026-01-08
**Related**: [Milestone 9: GitHub Identity Integration](../milestones/09-github-identity.md)

---

## Overview

This document defines the UX and component architecture for GitHub authentication and account settings in shipyard. The goal is to provide a clear, accessible authentication flow in the bottom-left corner of the sidebar.

---

## 1. Visual Hierarchy

### Desktop Sidebar (Expanded)

```
+---------------------------+
|  Plans                [<] |
+---------------------------+
| [Inbox]                   |
|   - Plan A                |
| [My Plans]                |
|   - Plan B                |
| [Shared with me]          |
|   - Plan C                |
+---------------------------+
|                           |
| (spacer)                  |
|                           |
+---------------------------+
| Footer Section            |
|  +---------------------+  |
|  | [Avatar] username   |  | <-- Account button (authenticated)
|  +---------------------+  |
|  |  OR                 |  |
|  | [GH] Sign in        |  | <-- Sign-in button (unauthenticated)
|  +---------------------+  |
|  | [Archive] [Theme]   |  |
+---------------------------+
```

### Desktop Sidebar (Collapsed)

```
+------+
|  [>] |
+------+
| [Inbox icon]
| [Plans icon]
| [Shared icon]
+------+
| [Avatar] | <-- User avatar (click opens profile menu)
| [Archive]|
| [Theme]  |
+------+
```

### Mobile Drawer

Same as expanded desktop but in the slide-out drawer.

---

## 2. Authentication States

### State 1: Not Authenticated

**Visual:**
- GitHub logo + "Sign in" text button
- Subtle, non-intrusive (users can still view public plans)

**Trigger:** Click opens `GitHubAuthModal`

**Component:**
```tsx
<Button
  variant="ghost"
  size="sm"
  onPress={startAuth}
  className="w-full justify-start gap-2"
>
  <GitHubLogo className="w-4 h-4" />
  <span>Sign in with GitHub</span>
</Button>
```

### State 2: Authenticating (Device Flow Active)

**Visual:**
- `GitHubAuthModal` is open (existing component)
- Shows device code, "Waiting for authorization..." spinner
- Sidebar button shows spinner while modal is open

**No changes needed to modal** - existing implementation handles this well.

### State 3: Authenticated

**Visual:**
- Avatar (GitHub profile picture)
- Username (GitHub username)
- Clickable - opens dropdown menu

**Component:**
```tsx
<Dropdown>
  <Dropdown.Trigger className="w-full">
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-elevated">
      <Avatar size="sm">
        <Avatar.Image src={identity.avatarUrl} alt={identity.username} />
        <Avatar.Fallback>{identity.username[0].toUpperCase()}</Avatar.Fallback>
      </Avatar>
      <span className="text-sm truncate">{identity.username}</span>
    </div>
  </Dropdown.Trigger>
  <Dropdown.Popover placement="top start">
    <Dropdown.Menu>
      {/* Menu items */}
    </Dropdown.Menu>
  </Dropdown.Popover>
</Dropdown>
```

### State 4: Token Invalid / Needs Re-auth

**Visual:**
- Avatar with warning badge overlay
- "Re-authenticate" in dropdown

**Detection:**
- `useGitHubAuth()` validates token on mount via `validateToken()`
- If invalid, `clearStoredIdentity()` is called
- User sees "Sign in" state

**Enhanced UX:**
- Before clearing, show toast: "Your GitHub session has expired. Please sign in again."
- Could keep username visible but grayed out until re-auth

### State 5: Validating Token

**Visual:**
- Avatar with subtle loading indicator (pulse animation or skeleton)
- Or just show avatar normally (validation is quick)

**Recommendation:** Don't show loading state for validation - it's jarring. Only show if validation takes > 1 second.

### State 6: Error During Auth

**Visual:**
- Error shown in modal (existing behavior)
- "Try Again" button in modal
- Sidebar still shows "Sign in" button

---

## 3. Settings Dropdown Menu

When authenticated user clicks their profile, show this menu:

```
+---------------------------+
| Header                    |
|  [Avatar] Username        |
|  @github_handle           |
+---------------------------+
|  View GitHub Profile      | -> Opens github.com/username
|  ----------------------   |
|  Switch Account           | -> Clears auth, opens modal
|  Sign Out                 | -> Clears auth
+---------------------------+
```

### Menu Items

| Item | Icon | Action | Notes |
|------|------|--------|-------|
| View GitHub Profile | External link icon | `window.open(github.com/${username})` | Opens in new tab |
| Switch Account | Refresh icon | `clearAuth()` then `startAuth()` | For users with multiple accounts |
| Sign Out | Log out icon | `clearAuth()` | Clears localStorage, returns to "Sign in" |

### HeroUI Dropdown Implementation

```tsx
<Dropdown>
  <Dropdown.Trigger className="w-full rounded-md">
    <UserProfileButton identity={identity} isValidating={isValidating} />
  </Dropdown.Trigger>
  <Dropdown.Popover placement="top start" className="min-w-[220px]">
    {/* User info header */}
    <div className="px-3 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <Avatar size="md">
          <Avatar.Image src={identity.avatarUrl} alt={identity.username} />
          <Avatar.Fallback>{getInitials(identity.displayName)}</Avatar.Fallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{identity.displayName}</span>
          <span className="text-xs text-muted-foreground truncate">@{identity.username}</span>
        </div>
      </div>
    </div>

    <Separator />

    <Dropdown.Menu onAction={handleMenuAction}>
      <Dropdown.Item id="view-profile" textValue="View GitHub Profile">
        <ExternalLink className="w-4 h-4 text-muted-foreground" />
        <Label>View GitHub Profile</Label>
      </Dropdown.Item>

      <Separator />

      <Dropdown.Item id="switch-account" textValue="Switch Account">
        <RefreshCw className="w-4 h-4 text-muted-foreground" />
        <Label>Switch Account</Label>
      </Dropdown.Item>

      <Dropdown.Item id="sign-out" textValue="Sign Out" variant="danger">
        <LogOut className="w-4 h-4 text-danger" />
        <Label>Sign Out</Label>
      </Dropdown.Item>
    </Dropdown.Menu>
  </Dropdown.Popover>
</Dropdown>
```

---

## 4. Component Breakdown

### New Components

#### `AccountSection.tsx`

Main container for the account area in sidebar footer.

```tsx
interface AccountSectionProps {
  /** Whether sidebar is collapsed (icon-only mode) */
  collapsed?: boolean;
}

export function AccountSection({ collapsed = false }: AccountSectionProps) {
  const { identity, isValidating, authState, startAuth, clearAuth } = useGitHubAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Open modal when auth flow starts
  useEffect(() => {
    if (authState.status === 'polling' || authState.status === 'awaiting_code') {
      setShowAuthModal(true);
    }
  }, [authState.status]);

  if (!identity) {
    return (
      <>
        <SignInButton collapsed={collapsed} onPress={() => {
          startAuth();
          setShowAuthModal(true);
        }} />
        <GitHubAuthModal
          isOpen={showAuthModal}
          onOpenChange={setShowAuthModal}
          authState={authState}
          onStartAuth={startAuth}
          onCancel={() => setShowAuthModal(false)}
        />
      </>
    );
  }

  return (
    <UserMenu
      identity={identity}
      isValidating={isValidating}
      collapsed={collapsed}
      onSignOut={clearAuth}
      onSwitchAccount={() => {
        clearAuth();
        startAuth();
        setShowAuthModal(true);
      }}
    />
  );
}
```

#### `SignInButton.tsx`

Button shown when not authenticated.

```tsx
interface SignInButtonProps {
  collapsed?: boolean;
  onPress: () => void;
}

export function SignInButton({ collapsed, onPress }: SignInButtonProps) {
  if (collapsed) {
    return (
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={onPress}
            aria-label="Sign in with GitHub"
            className="w-10 h-10"
          >
            <GitHubLogo className="w-4 h-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Sign in with GitHub</Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={onPress}
      className="w-full justify-start gap-2 px-2"
    >
      <GitHubLogo className="w-4 h-4" />
      <span className="text-sm">Sign in with GitHub</span>
    </Button>
  );
}
```

#### `UserMenu.tsx`

Dropdown menu for authenticated users.

```tsx
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
      <Dropdown.Trigger className={collapsed ? 'rounded-full' : 'w-full rounded-md'}>
        <UserProfileButton
          identity={identity}
          isValidating={isValidating}
          collapsed={collapsed}
        />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="top start" className="min-w-[220px]">
        {/* Header with full user info */}
        <UserInfoHeader identity={identity} />
        <Separator />
        <Dropdown.Menu onAction={handleAction}>
          <Dropdown.Item id="view-profile" textValue="View GitHub Profile">
            <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
            <Label>View GitHub Profile</Label>
          </Dropdown.Item>
          <Separator />
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
```

#### `UserProfileButton.tsx`

The trigger button that shows avatar + username.

```tsx
interface UserProfileButtonProps {
  identity: GitHubIdentity;
  isValidating: boolean;
  collapsed?: boolean;
}

export function UserProfileButton({ identity, isValidating, collapsed }: UserProfileButtonProps) {
  // Collapsed: just avatar
  if (collapsed) {
    return (
      <div className="relative">
        <Avatar size="sm" className={isValidating ? 'opacity-50' : ''}>
          <Avatar.Image src={identity.avatarUrl} alt={identity.username} />
          <Avatar.Fallback>{identity.username[0].toUpperCase()}</Avatar.Fallback>
        </Avatar>
        {isValidating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        )}
      </div>
    );
  }

  // Expanded: avatar + username
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-elevated transition-colors w-full">
      <Avatar size="sm" className={isValidating ? 'opacity-50' : ''}>
        <Avatar.Image src={identity.avatarUrl} alt={identity.username} />
        <Avatar.Fallback>{identity.username[0].toUpperCase()}</Avatar.Fallback>
      </Avatar>
      <span className="text-sm truncate flex-1 text-left">{identity.username}</span>
      {isValidating && <Spinner size="sm" />}
    </div>
  );
}
```

#### `UserInfoHeader.tsx`

Header inside the dropdown showing full user details.

```tsx
interface UserInfoHeaderProps {
  identity: GitHubIdentity;
}

export function UserInfoHeader({ identity }: UserInfoHeaderProps) {
  return (
    <div className="px-3 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <Avatar size="md">
          <Avatar.Image src={identity.avatarUrl} alt={identity.username} />
          <Avatar.Fallback>
            {getInitials(identity.displayName || identity.username)}
          </Avatar.Fallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">
            {identity.displayName || identity.username}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            @{identity.username}
          </span>
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
```

---

## 5. Flow Diagrams

### Flow 1: First-Time Login

```
User opens app
    |
    v
[Sidebar shows "Sign in with GitHub" button]
    |
    v
User clicks button
    |
    v
[GitHubAuthModal opens]
[Modal shows "Continue with GitHub" button]
    |
    v
User clicks "Continue"
    |
    v
[startDeviceFlow() called]
[Modal shows device code: "ABC-123"]
[Modal shows "Waiting for authorization..." spinner]
    |
    v
User goes to github.com/login/device
User enters code
User authorizes app
    |
    v
[Polling detects success]
[getGitHubUser() fetches profile]
[Identity stored in localStorage]
    |
    v
[Modal shows success checkmark]
[Modal auto-closes after 1s]
    |
    v
[Sidebar now shows avatar + username]
```

### Flow 2: Returning User (Already Authenticated)

```
User opens app
    |
    v
[localStorage has identity]
[useSyncExternalStore returns identity]
    |
    v
[Sidebar shows avatar + username]
    |
    v (async)
[validateToken() checks if token still works]
    |
    +-- Token valid --> [No change]
    |
    +-- Token invalid --> [clearStoredIdentity()]
                          [Show toast: "Session expired"]
                          [Sidebar shows "Sign in" button]
```

### Flow 3: Sign Out

```
User clicks avatar
    |
    v
[Dropdown menu opens]
    |
    v
User clicks "Sign Out"
    |
    v
[clearAuth() called]
[localStorage cleared]
[useSyncExternalStore updates]
    |
    v
[Dropdown closes]
[Sidebar shows "Sign in" button]
```

### Flow 4: Token Expired (Re-auth)

```
User opens app with expired token
    |
    v
[validateToken() returns false]
    |
    v
[clearStoredIdentity()]
[Toast: "Your GitHub session has expired"]
    |
    v
[Sidebar shows "Sign in" button]
    |
    v
User clicks "Sign in"
    |
    v
[Same as Flow 1]
```

### Flow 5: Switch Account

```
User clicks avatar
    |
    v
[Dropdown menu opens]
    |
    v
User clicks "Switch Account"
    |
    v
[clearAuth() called]
[startAuth() called immediately]
[GitHubAuthModal opens]
    |
    v
[Same as Flow 1, but user logs into different GitHub account]
```

---

## 6. Edge Cases

### Avatar Fails to Load

**Scenario:** GitHub avatar URL returns 404 or network error.

**Solution:** HeroUI Avatar has built-in fallback support.

```tsx
<Avatar>
  <Avatar.Image
    src={identity.avatarUrl}
    alt={identity.username}
    onError={() => {/* Fallback automatically shown */}}
  />
  <Avatar.Fallback delayMs={300}>
    {identity.username[0].toUpperCase()}
  </Avatar.Fallback>
</Avatar>
```

The `Avatar.Fallback` component:
- Shows initials when image fails
- Has optional `delayMs` to prevent flash on slow connections
- Can use colored backgrounds via `color` prop

### Username Is Very Long

**Scenario:** User has username like `super-long-github-username-example`

**Solution:** Truncate with ellipsis.

```tsx
<span className="text-sm truncate max-w-[120px]">{identity.username}</span>
```

In dropdown header, show full username with word wrap:
```tsx
<span className="text-xs text-muted-foreground break-all">
  @{identity.username}
</span>
```

### Mobile View (Sidebar Collapsed/Drawer)

**Scenario:** On mobile, sidebar is in a drawer.

**Current Behavior:**
- `inDrawer` prop passed to Sidebar
- Mobile shows expanded content in drawer

**Solution:** AccountSection should check `inDrawer` prop and always show expanded view in drawer.

```tsx
// In Sidebar.tsx
<AccountSection collapsed={!inDrawer && collapsed} />
```

### Loading State Between Pages

**Scenario:** User navigates between plans while validation runs.

**Solution:** `isValidating` state is in the hook, persists across navigation. Avatar shows subtle loading indicator.

### Multiple Tabs (Sync Auth State)

**Scenario:** User signs out in Tab A, Tab B should update.

**Current Implementation:** Already handled!

```tsx
// useGitHubAuth.ts - subscribeStorage
function subscribeStorage(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}
```

When Tab A clears localStorage, Tab B receives `storage` event and updates.

### User Cancels Device Flow

**Scenario:** User opens modal, doesn't complete auth, closes modal.

**Current Behavior:**
- `cancelAuth()` is called via `onCancel` prop
- Sets `cancelRequestedRef.current = true`
- Polling loop exits with `{ status: 'cancelled' }`
- Auth state returns to `idle`

**UX:** No error shown, user can try again by clicking "Sign in" again.

### Network Error During Auth

**Scenario:** Network fails during device flow.

**Current Behavior:**
- `startDeviceFlow()` throws
- Caught in `startAuth()` catch block
- `authState = { status: 'error', message: '...' }`
- Modal shows error with "Try Again" button

### Display Name vs Username

**Current Implementation:**
```typescript
interface GitHubIdentity {
  token: string;
  username: string;      // GitHub login (e.g., "jacobpetterle")
  displayName: string;   // GitHub name (e.g., "Jacob Petterle") or login if not set
  avatarUrl?: string;
  createdAt: number;
}
```

- `displayName` is preferred for UI display
- `username` is used for ownership/approval checks
- In dropdown header, show both

---

## 7. Integration with Existing Code

### Replace ProfileSetup Usage

**Current:** Sidebar opens `ProfileSetup` modal for editing display name.

**Change:** Replace with GitHub-based identity. Display name comes from GitHub profile.

**Migration Path:**
1. Add `AccountSection` component to sidebar footer
2. Remove `ProfileSetup` modal trigger from sidebar
3. Keep `ProfileSetup` component for now (may be needed for non-GitHub identity fallback)

### Update Sidebar Footer

**Current (from Sidebar.tsx):**
```tsx
{/* Footer with profile, archive toggle, and theme toggle */}
<div className="px-3 py-2 border-t border-separator flex items-center gap-0 shrink-0 mt-auto">
  <Button
    isIconOnly
    variant="ghost"
    size="sm"
    aria-label="Profile"
    onPress={() => setShowProfile(true)}
    className="touch-target flex-1"
  >
    <User className="w-4 h-4 text-foreground" />
  </Button>
  <Button
    isIconOnly
    variant="ghost"
    size="sm"
    aria-label={showArchived ? 'Hide archived plans' : 'Show archived plans'}
    onPress={handleToggleArchived}
    className={`touch-target flex-1 ${showArchived ? 'text-primary' : ''}`}
  >
    <Archive className="w-4 h-4" />
  </Button>
  <div className="flex-1 flex justify-center">
    <ThemeToggle />
  </div>
</div>
```

**New:**
```tsx
{/* Footer with GitHub account, archive toggle, and theme toggle */}
<div className="px-3 py-2 border-t border-separator flex flex-col gap-2 shrink-0 mt-auto">
  {/* Account section - takes full width */}
  <AccountSection collapsed={false} />

  {/* Utility buttons row */}
  <div className="flex items-center gap-0">
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label={showArchived ? 'Hide archived plans' : 'Show archived plans'}
      onPress={handleToggleArchived}
      className={`touch-target flex-1 ${showArchived ? 'text-primary' : ''}`}
    >
      <Archive className="w-4 h-4" />
    </Button>
    <div className="flex-1 flex justify-center">
      <ThemeToggle />
    </div>
  </div>
</div>
```

### CollapsedSidebar Update

**Current:**
```tsx
<Button
  isIconOnly
  variant="ghost"
  size="sm"
  aria-label="Profile"
  onPress={() => onShowProfile(true)}
  className="w-10 h-10"
>
  <User className="w-4 h-4 text-foreground" />
</Button>
```

**New:**
```tsx
<AccountSection collapsed={true} />
```

---

## 8. Accessibility Considerations

### Keyboard Navigation

- **Tab** to focus sign-in button or avatar
- **Enter/Space** to activate
- **Arrow keys** to navigate dropdown menu
- **Escape** to close dropdown/modal

HeroUI's `Dropdown` and `Modal` components handle this automatically via React Aria.

### Screen Reader Announcements

```tsx
// Sign in button
<Button aria-label="Sign in with GitHub">

// User menu trigger
<Dropdown.Trigger aria-label={`Account menu for ${identity.username}`}>

// Avatar fallback
<Avatar.Fallback aria-hidden="true">{initials}</Avatar.Fallback>
```

### Focus Management

- After sign-in success, focus returns to the sidebar
- After sign-out, focus moves to the sign-in button
- Modal traps focus while open (React Aria default)

---

## 9. File Structure

```
apps/web/src/
  components/
    account/
      AccountSection.tsx      # Main container
      SignInButton.tsx        # Unauthenticated state
      UserMenu.tsx            # Authenticated dropdown
      UserProfileButton.tsx   # Avatar + username trigger
      UserInfoHeader.tsx      # Dropdown header
      index.ts                # Barrel export
    GitHubAuthModal.tsx       # Existing - no changes needed
  hooks/
    useGitHubAuth.ts          # Existing - no changes needed
```

---

## 10. State Management Summary

| State | Source | Storage | Sync Mechanism |
|-------|--------|---------|----------------|
| `identity` | `useGitHubAuth()` | localStorage | `useSyncExternalStore` + `storage` event |
| `isValidating` | `useGitHubAuth()` | React state | Component-local |
| `authState` | `useGitHubAuth()` | React state | Component-local |
| `showAuthModal` | `AccountSection` | React state | Component-local |

---

## 11. Testing Considerations

### Unit Tests

- `AccountSection`: Renders sign-in button when no identity
- `AccountSection`: Renders user menu when identity exists
- `UserMenu`: Calls correct handlers on menu item selection
- `SignInButton`: Shows tooltip in collapsed mode

### Integration Tests

- Full auth flow with mocked GitHub API
- Multi-tab sync: sign out in one tab, verify other updates

### E2E Tests

- Click sign in -> modal opens -> enter code -> authenticated
- Click sign out -> returns to sign in state
- Click switch account -> clears and restarts flow

---

## 12. Future Enhancements

### Token Info in Menu (Optional)

```
+---------------------------+
| Authenticated as          |
| @jacobpetterle           |
|                          |
| Signed in: 2 days ago    |  <-- Show when token was created
+---------------------------+
```

### Re-auth Prompt (Optional)

When token validation fails, show inline prompt instead of just sign-in button:

```
+---------------------------+
| [!] Session expired       |
| [Re-authenticate]         |
+---------------------------+
```

### Anonymous Mode Toggle (Future)

Allow users to browse without GitHub auth for public plans:

```
+---------------------------+
| [GH] Sign in with GitHub  |
| or                        |
| [Continue as Guest]       |
+---------------------------+
```

---

## 13. Implementation Checklist

- [ ] Create `apps/web/src/components/account/` directory
- [ ] Implement `AccountSection.tsx`
- [ ] Implement `SignInButton.tsx`
- [ ] Implement `UserMenu.tsx`
- [ ] Implement `UserProfileButton.tsx`
- [ ] Implement `UserInfoHeader.tsx`
- [ ] Create barrel export `index.ts`
- [ ] Update `Sidebar.tsx` to use `AccountSection`
- [ ] Update `CollapsedSidebar` to use `AccountSection`
- [ ] Add toast notification for expired token
- [ ] Test multi-tab sync
- [ ] Test mobile drawer layout
- [ ] Test keyboard navigation
- [ ] Test screen reader announcements

---

*Design created: 2026-01-08*
