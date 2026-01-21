# ADR-0003: Mobile OAuth User-Agent Detection

## Status
Accepted

## Context

**Issue #83** reported that mobile browsers (iOS Safari, Android Chrome) could briefly open a desktop app during the GitHub OAuth flow instead of staying in the mobile browser, creating jarring UX.

**Root cause:** When GitHub redirects back to the app domain (e.g., `https://schoolai.github.io/shipyard?code=xxx`), mobile operating systems check for Universal Links (iOS) or App Links (Android) configuration. If the domain is associated with an installed app, the OS may launch that app instead of staying in the browser.

This only occurs if `.well-known/apple-app-site-association` (iOS) or `.well-known/assetlinks.json` (Android) files exist on the domain and are configured to deep link the OAuth callback path.

## Investigation

Checked for deep link configuration files:
```bash
ls -la apps/web/public/.well-known/
# Result: Directory does not exist
```

**Conclusion:** The deep linking issue is **theoretical** in our current setup. We have no Universal Links or App Links configured, so mobile OAuth should work correctly without intervention.

However, if a Shipyard mobile app is developed in the future and deep linking is configured, this issue could manifest.

## Decision

Implement **User-Agent detection** in the OAuth worker to:
1. Detect mobile devices (iPhone, iPad, iPod, Android) via User-Agent header
2. Include `is_mobile: true` flag in token exchange response for mobile browsers
3. Log the mobile detection in the web app for debugging

This provides:
- **Future-proofing:** If deep linking is configured later, we have mobile detection in place
- **Debugging visibility:** Console logs help troubleshoot OAuth issues on mobile
- **Analytics potential:** Mobile detection can be used for usage analytics
- **Minimal complexity:** Simple regex check, no infrastructure changes

## Alternatives Considered

### 1. Separate Mobile Redirect Path
Register a different OAuth redirect URI for mobile (e.g., `/oauth-mobile`) in GitHub OAuth settings.

**Pros:** Can configure `.well-known` files to exclude mobile-specific paths

**Cons:** Requires GitHub OAuth config changes, more complex URL handling

### 2. Deep Link Configuration Changes
Modify `.well-known` files to exclude OAuth callback paths from deep linking.

**Pros:** Addresses root cause directly

**Cons:** Only relevant if files exist (they don't); fragile to maintain

### 3. No Code Changes
Document that deep linking must not include OAuth paths if configured in the future.

**Pros:** Simplest approach

**Cons:** No runtime visibility, harder to debug if issue occurs

## Consequences

### Positive
- Simple implementation (2 files modified)
- No infrastructure or GitHub OAuth config changes required
- Desktop OAuth flow completely unchanged (zero regression risk)
- Mobile detection available for future features

### Negative
- Relies on User-Agent header (can be spoofed, but acceptable for UX improvement, not security)
- Mobile flag currently only used for logging (not preventing deep linking)

### Neutral
- If deep linking is configured in the future, additional work will be needed to leverage the mobile detection (e.g., use alternative redirect handling)

## Implementation Details

**Files modified:**
- `apps/github-oauth-worker/src/index.ts` - Added `isMobileUserAgent()` function, added `is_mobile` to response
- `apps/web/src/utils/github-web-flow.ts` - Added `is_mobile` to `TokenExchangeResponse` interface
- `apps/web/src/hooks/useGitHubAuth.ts` - Added console logging when `is_mobile` is true

**Detection regex:**
```typescript
function isMobileUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}
```

**Response format:**
```typescript
interface TokenExchangeResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  is_mobile?: boolean; // Present and true for mobile devices
}
```

## Testing Strategy

### Manual Testing (Required for Production)
1. **iOS Safari:**
   - Open `https://schoolai.github.io/shipyard` on iPhone
   - Sign in with GitHub
   - Verify: OAuth flow completes successfully in mobile browser
   - Check console logs for `[OAuth] Mobile device detected` message

2. **Android Chrome:**
   - Same test as iOS Safari on Android device
   - Verify: OAuth flow completes in Chrome (no app launch)

3. **Desktop Chrome:**
   - Complete OAuth flow on desktop
   - Verify: No regression, no `is_mobile` flag in logs

### Edge Cases
- **iPad:** Detected as mobile (safe - treated same as iPhone)
- **User-Agent spoofing:** Acceptable - only affects logging, not security
- **Dev tools mobile emulation:** Will be detected as mobile (expected)

## Future Work

If a Shipyard mobile app is developed and deep linking is configured:

1. **Create separate OAuth paths:**
   - Desktop: `https://schoolai.github.io/shipyard/`
   - Mobile: `https://schoolai.github.io/shipyard/oauth-mobile`

2. **Update `.well-known` configuration:**
   ```json
   {
     "applinks": {
       "details": [{
         "appIDs": ["TeamID.com.example.shipyard"],
         "components": [{
           "exclude": true,
           "/": "/oauth-mobile"
         }]
       }]
     }
   }
   ```

3. **Leverage `is_mobile` flag:** Direct mobile users to mobile-specific OAuth path

## References

- Issue #83: https://github.com/schoolai/Shipyard/issues/83
- Universal Links: https://developer.apple.com/ios/universal-links/
- App Links: https://developer.android.com/training/app-links

---

*Created: 2026-01-18*
*Author: Claude Code*
