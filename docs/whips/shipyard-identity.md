# Shipyard Identity: Multi-Provider Auth & CLI Login

**Created:** 2026-02-15
**Status:** Draft
**Scope:** Shipyard-native user identity, OAuth provider linking, CLI device-flow login, daemon token management

---

## Executive Summary

Replace the current GitHub-coupled identity (`sub: "gh_12345"`) with a Shipyard-native user identity that links to one or more OAuth providers. Users authenticate via `shipyard login` (CLI device flow) or the web app (browser redirect). No email/password signup — OAuth only.

This unblocks:
- Publishing `@schoolai/shipyard` to npm (daemon needs a login story)
- Future Google OAuth support
- Collab rooms where participants may use different providers
- Token refresh without re-authentication

---

## Current State

The session server (`apps/session-server`) has a single auth path:

```
Browser → GitHub OAuth redirect → /auth/github/callback → JWT (sub: "gh_12345")
```

The JWT payload is tightly coupled to GitHub:

```typescript
{
  sub: "gh_12345",     // GitHub-derived, IS the user ID
  ghUser: "username",
  ghId: 12345,
  iat: ..., exp: ...
}
```

The daemon gets a token via manual env var (`SHIPYARD_USER_TOKEN`). No CLI login, no refresh, no storage.

---

## Proposed Architecture

### Identity Model

```
ShipyardUser
  id: "usr_abc123"              // Shipyard-native, stable across providers
  displayName: "Jacob"
  avatarUrl: "..."
  createdAt: timestamp

LinkedIdentity[]
  provider: "github" | "google" // Extensible enum
  providerId: "12345"           // Provider's user ID
  providerUsername: "jacob"     // Display name from provider
  linkedAt: timestamp
```

A user can have multiple linked identities. First OAuth login creates the ShipyardUser and links the identity. Subsequent logins from a different provider can link to the same user (if they match by email or explicit linking in the web app).

### JWT Claims (new)

```typescript
{
  sub: "usr_abc123",            // Shipyard-native ID
  displayName: "Jacob",
  providers: ["github"],        // Which providers are linked
  scope?: "task:abc123",        // Optional: scoped agent tokens
  machineId?: "macbook-pro",    // Optional: daemon tokens
  iat: number,
  exp: number
}
```

### Storage

Cloudflare D1 (SQLite at the edge) in the session server:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- "usr_" + nanoid
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE linked_identities (
  provider TEXT NOT NULL,        -- "github", "google"
  provider_id TEXT NOT NULL,     -- Provider's user ID
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_username TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);

CREATE INDEX idx_identities_user ON linked_identities(user_id);
```

---

## CLI Login: Device Flow

The daemon runs headless — it can't do browser redirects. Use the [OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628) pattern:

```
$ shipyard login

  Open this URL in your browser:
  https://shipyard.so/auth/device?code=ABCD-1234

  Waiting for authorization...
  Logged in as Jacob (github: jacobpetterle)
  Token saved to ~/.shipyard/config.json
```

### Flow

```
Daemon                          Session Server                    Browser
  |                                  |                               |
  |-- POST /auth/device/start ------>|                               |
  |<-- { deviceCode, userCode,       |                               |
  |      verificationUri } ----------|                               |
  |                                  |                               |
  |  (prints URL + userCode)         |                               |
  |                                  |<-- User opens URL ------------|
  |                                  |    Sees userCode, clicks      |
  |                                  |    "Sign in with GitHub" ---->|
  |                                  |<-- OAuth callback ------------|
  |                                  |    Links deviceCode to user   |
  |                                  |                               |
  |-- POST /auth/device/poll ------->|                               |
  |    { deviceCode }                |                               |
  |<-- { token, user } --------------|                               |
  |                                  |                               |
  |  (saves token to disk)           |                               |
```

### Token Storage

```json
// ~/.shipyard/config.json
{
  "auth": {
    "token": "eyJ...",
    "userId": "usr_abc123",
    "displayName": "Jacob",
    "expiresAt": 1739836800000,
    "signalingUrl": "wss://shipyard-session-server.jacob-191.workers.dev"
  }
}
```

The daemon reads this on startup instead of requiring env vars. Env vars (`SHIPYARD_USER_TOKEN`) still work as an override for CI/automation.

### Token Refresh

Two options (decide during implementation):

1. **Long-lived tokens** (30 days) with `shipyard login` to re-auth. Simple, good enough for now.
2. **Refresh tokens** — session server issues a refresh token alongside the JWT, daemon auto-refreshes before expiry. More complex, better UX.

Recommendation: start with option 1. A 30-day token with a clear "token expired, run `shipyard login`" error message is fine for early users.

---

## Web App Changes

### Login Page

Currently: "Sign in with GitHub" button → redirect flow.

After: Multiple provider buttons, all leading to the same ShipyardUser:
- "Sign in with GitHub"
- "Sign in with Google" (future)

### Device Auth Page

New page at `/auth/device?code=ABCD-1234`:
- Shows the user code for confirmation
- "Sign in with GitHub" / "Sign in with Google" buttons
- After OAuth, links the device code to the authenticated user
- Shows "You can close this tab" success message

### Account Linking

Settings page where users can link additional providers to their account. Not MVP — can come later.

---

## Session Server Changes

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/device/start` | Start device flow, returns codes |
| GET | `/auth/device/verify` | Web page for user to authorize |
| POST | `/auth/device/poll` | Daemon polls for token |
| POST | `/auth/google/callback` | Google OAuth exchange (future) |

### Migration Path

1. **Phase 1:** Add D1 storage, create ShipyardUser on GitHub login, issue new JWT format. Old JWTs still work (backward compat via `sub` prefix check: `gh_` = legacy, `usr_` = new).
2. **Phase 2:** Add device flow endpoints. Ship `shipyard login` in daemon.
3. **Phase 3:** Add Google OAuth. Add account linking page.

---

## Daemon Changes

### `shipyard login`

New CLI subcommand (not a flag — it's a separate action):

```
$ shipyard login          # Interactive device flow
$ shipyard login --check  # Print current auth status
$ shipyard logout         # Clear stored token
```

### Auto-Connect

On startup, the daemon:
1. Checks `SHIPYARD_USER_TOKEN` env var (override for CI)
2. Falls back to `~/.shipyard/config.json`
3. Validates token isn't expired
4. Connects to signaling with the token

If no token exists, prints: "Run `shipyard login` to authenticate."

---

## Open Questions

1. **Account merging:** If a user signs in with GitHub first, then later signs in with Google using the same email, should we auto-link? Or require explicit linking? Auto-link is convenient but could be a security issue if someone controls a different account with the same email.

2. **Org/team support:** Do we need org-level identity (SchoolAI org → multiple users) or is per-user enough for now? Per-user is simpler and probably sufficient until we have paying customers.

3. **Token scoping for collab rooms:** When a daemon joins a collab room, should it use the owner's token or get a scoped token? Scoped tokens are more secure but add complexity.

---

*Last updated: 2026-02-15*
