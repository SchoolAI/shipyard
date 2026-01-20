# Milestone 9: GitHub Identity Integration

**Status**: Planning
**Goal**: Replace random server/browser IDs with verified GitHub usernames for ownership and approval

---

## Overview

Currently we have an identity mismatch:
- **Server**: `ownerId = random-server-id` (from `~/.shipyard/server-id`)
- **Browser**: `identity.id = random-browser-id` (from localStorage)
- **Problem**: Even YOU see waiting room on YOUR OWN plans

**Solution**: Use GitHub as trusted identity provider
- Server gets username from `gh api user` (already authenticated)
- Browser does GitHub Device Flow to get username
- Both use GitHub username for ownership/approval checks

---

## User Flows

### Flow 1: You + Local MCP
```
1. You: "Claude, create a plan"
2. MCP server:
   - Runs: gh api user --jq .login → "jacobpetterle"
   - Creates plan: ownerId = "jacobpetterle"
   - Opens static site (not localhost)
3. Browser (static site):
   - No GitHub auth yet → shows Device Flow prompt
   - You auth as "jacobpetterle"
   - isUserApproved() → true (you're the owner)
   - Shows plan content
```

### Flow 2: Teammate Reviews
```
1. You create plan (ownerId: "jacobpetterle")
2. You share URL with teammate
3. Teammate opens in browser
4. Teammate does GitHub Device Flow
5. Auth as "teammate-gh"
6. isUserApproved() → false (not in approvedUsers)
7. Shows waiting room
8. (Future) You approve "teammate-gh"
```

### Flow 3: Devin Creates Plan
```
Devin scenario (future):
1. Devin already did GitHub OAuth (has your username)
2. You: "Devin, create a plan"
3. Devin: create_plan with your username somehow
   - Option A: You configure "My GitHub: jacobpetterle" in Devin
   - Option B: Devin infers from repo ownership
   - Option C: Devin asks you first time
4. Plan created: ownerId = "jacobpetterle"
5. You open, auth, approved
```

---

## Implementation Plan

### Phase 1: Server GitHub Identity

**Goal**: Server uses GitHub username as ownerId instead of random ID

**Files to modify:**
- `apps/server/src/server-identity.ts` - Replace with GitHub username

**Implementation:**
```typescript
// apps/server/src/server-identity.ts

import { execSync } from 'node:child_process';

let cachedUsername: string | null = null;

export function getGitHubUsername(): string {
  if (cachedUsername) {
    return cachedUsername;
  }

  try {
    const username = execSync('gh api user --jq .login', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!username) {
      throw new Error('No GitHub username returned');
    }

    cachedUsername = username;
    return cachedUsername;
  } catch (error) {
    throw new Error(
      'GitHub authentication required. Please run: gh auth login\n\n' +
      'This is needed to set plan ownership to your GitHub username.'
    );
  }
}
```

**Update create-plan.ts:**
```typescript
import { getGitHubUsername } from '../server-identity.js';

// In handler:
const ownerId = getGitHubUsername(); // Throws if not authenticated
initPlanMetadata(ydoc, {
  ...
  ownerId,
});
```

**Testing:**
- Run without `gh auth login` → should error with helpful message
- Run with `gh auth login` → should use your GitHub username

---

### Phase 2: Browser GitHub Device Flow

**Goal**: Browser authenticates with GitHub to get username

**New files:**
- `apps/web/src/hooks/useGitHubAuth.ts` - Device Flow hook
- `apps/web/src/components/GitHubAuthModal.tsx` - Auth UI
- `apps/web/src/utils/github-device-flow.ts` - Device Flow logic

**Device Flow Steps:**
1. Request device code from GitHub
2. Show modal: "Go to github.com/login/device and enter: ABC-123"
3. Poll GitHub every 5 seconds
4. When approved, get token
5. Use token to fetch user info: `GET /user`
6. Store { token, username, expiresAt } in localStorage

**Implementation:**

```typescript
// apps/web/src/utils/github-device-flow.ts

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  return response.json();
}

export async function pollForToken(
  deviceCode: string,
  interval: number
): Promise<AccessTokenResponse | null> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await response.json();

  if (data.error === 'authorization_pending') {
    return null; // Still waiting
  }

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data;
}

export async function getGitHubUser(token: string): Promise<{ login: string }> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}
```

**Hook:**
```typescript
// apps/web/src/hooks/useGitHubAuth.ts

interface GitHubIdentity {
  token: string;
  username: string;
  expiresAt: number;
}

export function useGitHubAuth() {
  const [identity, setIdentity] = useState<GitHubIdentity | null>(() => {
    const stored = localStorage.getItem('shipyard-github-identity');
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    // Check expiry
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem('shipyard-github-identity');
      return null;
    }
    return parsed;
  });

  const startAuth = async () => {
    const deviceCode = await startDeviceFlow();
    // Show modal, poll, etc.
    // On success:
    const user = await getGitHubUser(token);
    const identity = {
      token,
      username: user.login,
      expiresAt: Date.now() + (60 * 24 * 60 * 60 * 1000), // 60 days
    };
    localStorage.setItem('shipyard-github-identity', JSON.stringify(identity));
    setIdentity(identity);
  };

  return { identity, startAuth, clearAuth };
}
```

---

### Phase 3: Replace Current Identity System

**Files to modify:**
- `apps/web/src/hooks/useIdentity.ts` - Deprecate or merge with GitHub auth
- `apps/web/src/utils/identity.ts` - Update to use GitHub username
- `apps/web/src/components/ProfileSetup.tsx` - Show GitHub auth instead

**Decision needed:**
- **Option A**: Replace entirely (GitHub-only identity)
- **Option B**: Keep localStorage as fallback (GitHub preferred, random ID if unavailable)

**Recommendation:** Option A (GitHub-only) for simplicity

---

### Phase 4: Update Approval Logic

**Files to modify:**
- `apps/web/src/hooks/useMultiProviderSync.ts` - Use GitHub username for approval check

**Current:**
```typescript
const userId = identity?.id; // Random ID from localStorage
computeApprovalStatus(userId);
```

**New:**
```typescript
const { identity: githubIdentity } = useGitHubAuth();
const userId = githubIdentity?.username; // GitHub username
computeApprovalStatus(userId);
```

---

### Phase 5: GitHub Client ID Setup

**Required:** Register GitHub OAuth App to get CLIENT_ID

**Steps:**
1. Go to github.com/settings/developers
2. Create new OAuth App
3. Settings:
   - Name: "Shipyard"
   - Homepage: Your static site URL
   - Callback: Leave blank (Device Flow doesn't use it)
4. Get Client ID
5. Add to `.env`: `VITE_GITHUB_CLIENT_ID=...`
6. Document in README

**Permissions needed:** Just `user:email` (to read username)

---

## Edge Cases

### 1. Server Not Authenticated
```
User runs create_plan without gh auth login
→ Error with instructions: "Run: gh auth login"
→ Agent sees error, can prompt user
```

### 2. Browser Denies GitHub Auth
```
User clicks "Cancel" on Device Flow
→ Can't determine identity
→ Show: "GitHub auth required to view plans"
→ Option to retry
```

### 3. Token Expiry
```
Token expires after 60 days
→ Check expiry on page load
→ If expired, prompt re-auth
→ Same Device Flow
```

### 4. Multiple GitHub Accounts
```
User has multiple accounts (personal + work)
→ They choose which to auth with
→ That username is used for approval
→ Clear localStorage to switch accounts
```

### 5. Agent Without gh CLI
```
Remote agent (Devin) doesn't have gh CLI
→ Options:
  - Require GITHUB_TOKEN env var
  - Read username from git config (unverified)
  - Require agent to pass ownerId parameter
```

---

## Backward Compatibility

**Plans created before this change:**
- `ownerId = random-server-id` (not a GitHub username)
- `approvedUsers = [random-server-id]`

**Handling:**
- Plans without GitHub username in ownerId → no approval required
- OR: Add migration tool to update old plans

**Recommendation:** No backward compat (new app, can recreate plans)

---

## Security Considerations

### Token Storage
```typescript
// Store in localStorage
localStorage.setItem('shipyard-github-identity', JSON.stringify({
  token: "ghp_...",  // GitHub PAT
  username: "jacobpetterle",
  expiresAt: timestamp,
}));
```

**Risks:**
- XSS could steal token
- Token has minimal scopes (just `user:email`)
- Can be revoked on GitHub

**Mitigations:**
- Use HttpOnly cookie (but can't do on static site)
- Short expiry (60 days max)
- Educate users to revoke if concerned

### Username Spoofing via CRDT
```
Malicious peer connects to WebRTC mesh
→ Writes approvedUsers = ["attacker-gh"]
→ Tries to approve themselves
```

**Protection:** Phase 5 (Signaling Server) validates writes
- Server checks: is modifier in approvedUsers?
- If not, reject CRDT write
- Client-only approval checks are bypassable

---

## Testing Plan

### Test 1: Server Identity
```bash
# Without auth
gh auth logout
node apps/server/dist/index.mjs
# Call create_plan → should error

# With auth
gh auth login
node apps/server/dist/index.mjs
# Call create_plan → ownerId should be your GitHub username
```

### Test 2: Browser Device Flow
```
1. Clear localStorage
2. Open plan on static site
3. Should see Device Flow modal
4. Go to github.com/login/device
5. Enter code, approve
6. Browser should get username
7. Check approval → owner should be approved
```

### Test 3: Cross-Device
```
1. Create plan on machine A (ownerId: "jacobpetterle")
2. Open on machine B in different browser
3. Auth as different GitHub account
4. Should see waiting room (not approved)
```

---

## Critical Fixes from Review

### 1. OAuth Scopes (MUST FIX)
- ~~`user:email` scope~~ **NOT NEEDED**
- `/user` endpoint returns `login` with NO scopes
- Request empty scope (minimal access)

### 2. Device Flow Error Handling (MUST FIX)
Add handling for:
- `authorization_pending` - continue polling
- `slow_down` - increase interval by 5 seconds
- `expired_token` - restart flow
- `access_denied` - user-friendly message
- Timeout after `expires_in`

### 3. Token Expiry (MUST FIX)
- ~~Fake 60-day expiry~~ **WRONG**
- GitHub Device Flow tokens DON'T expire
- Store `createdAt`, validate on load by calling `/user`
- Re-auth only on 401 response

### 4. Display Name vs Username (SHOULD ADD)
Fetch both from GitHub:
```typescript
interface GitHubIdentity {
  username: string;      // login - for approval
  displayName: string;   // name - for UI display
  avatarUrl?: string;    // avatar_url
}
```

### 5. Anonymous Viewing (SHOULD ADD)
- Public plans (`approvalRequired: false`) → viewable without auth
- Private plans → require GitHub auth

### 6. Feature Flag (SHOULD ADD)
```typescript
VITE_ENABLE_GITHUB_IDENTITY=true
```
For gradual rollout and testing.

## Open Questions

1. ~~**GitHub OAuth App scope**~~ → **RESOLVED**: No scopes needed
2. ~~**Token refresh**~~ → **RESOLVED**: Tokens don't expire, validate on load
3. **Fallback identity:** Anonymous viewing for public plans? **YES** (recommended)
4. **Migration:** Existing plans with random ownerId? → Skip approval checks (legacy mode)
5. **Static site URL:** What's the production URL?
6. **OAuth App vs GitHub App:** Start with OAuth App (simpler), migrate to GitHub App later?

---

## Dependencies

- GitHub OAuth App registration (CLIENT_ID)
- Server requires `gh auth login`
- Browser needs GitHub login (one-time)

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Phase 1: Server GitHub identity | 1-2 hours |
| Phase 2: Browser Device Flow | 4-6 hours |
| Phase 3: Replace identity system | 2-3 hours |
| Phase 4: Update approval logic | 1-2 hours |
| Phase 5: GitHub App setup | 1 hour |
| Testing | 2-3 hours |

**Total: ~2 days**

---

*Created: 2026-01-08*
