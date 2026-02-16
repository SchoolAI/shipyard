# ADR 0008: Shipyard-Native User Identity

## Status

**Accepted** (2026-02-15)

## Context

The session server originally coupled user identity to GitHub: JWT `sub` was `"gh_12345"`, and claims included `ghUser`/`ghId`. This blocked:

- Publishing the daemon to npm (no CLI login story without browser redirects)
- Future OAuth providers (Google, etc.)
- Collab rooms where participants use different providers

## Decision

Introduce a Shipyard-native user identity stored in Cloudflare D1:

- **ShipyardUser** with stable ID (`usr_abc123`) decoupled from any provider
- **LinkedIdentity** table linking providers (GitHub now, extensible to Google)
- **JWT claims** use `sub: "usr_*"`, `displayName`, `providers[]` instead of GitHub-specific fields
- **Device flow** (RFC 8628 pattern) for headless CLI login: `shipyard login`
- **30-day tokens** stored at `~/.shipyard/config.json` with env var override for CI

## Consequences

### Positive

- Daemon can authenticate without browser redirects
- Users can link multiple OAuth providers to one Shipyard identity
- JWT is provider-agnostic — adding Google OAuth only requires a new route + linked_identities row
- Token refresh is simple: run `shipyard login` again

### Negative

- D1 adds a database dependency to the session server (was previously stateless for auth)
- Device flow polling adds 3 new endpoints and ephemeral state
- Token refresh (automatic, via refresh tokens) is deferred — users must manually re-login after 30 days

### Mitigations

- D1 is only required for new logins; existing tokens continue to work if D1 is temporarily unavailable
- Device flow state is ephemeral (stored in Durable Object memory with TTL), no persistent cleanup needed

## Alternative Considered

1. **Keep GitHub-only identity** — Rejected: blocks multi-provider and npm publish
2. **OAuth PKCE flow for CLI** — Rejected: requires localhost callback server, complex for headless environments
3. **Email/password signup** — Rejected: adds password management complexity, OAuth is sufficient
4. **Refresh tokens** — Deferred to Phase 2: 30-day tokens with manual re-login is sufficient for early users

## References

- Design: [docs/whips/shipyard-identity.md](../whips/shipyard-identity.md)
- RFC 8628: [OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628)

## Revisit Criteria

- When user count exceeds ~100 and 30-day manual re-login becomes a support burden (add refresh tokens)
- When account merging requests arise from users with the same email across providers

---

*Created: 2026-02-15*
