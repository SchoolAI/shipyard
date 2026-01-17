# Review Status Migration - INCOMPLETE

The review-status.ts file needs significant refactoring to work without state.ts.

## Current State
- review-status.ts uses getSessionState/setSessionState/deleteSessionState from state.ts
- These are used to:
  1. Check if a session exists and get its planId
  2. Store sessionToken after approval
  3. Clean up on errors/rejection

## What's Needed
The hook needs a way to:
1. Get planId from sessionId (for checking review status)
2. Store sessionToken after generating it
3. The server already stores approval data in session registry via waitForApprovalHandler

## Solution Options

### Option 1: Add server API endpoints for session management
Add to hook router:
- `getSession(sessionId)` - returns session data from registry
- `updateSession(sessionId, data)` - updates session in registry
- `deleteSession(sessionId)` - deletes from registry

Hook code would call these instead of local state.ts functions.

### Option 2: Extend setSessionToken endpoint
Update SetSessionTokenRequest schema to include:
- sessionId (to identify which session)
- sessionToken plaintext (to store in registry for post_exit)

This way the hook can send both hash (for Y.Doc auth) and plaintext (for registry) in one call.

### Option 3: Use in-memory tracking like plan-manager.ts
Create simple in-memory map in review-status.ts to track sessionId → planId.
For sessionToken, still need server endpoint since it needs to survive until post_exit.

## Recommendation
Option 2 is cleanest - extend setSessionToken to accept sessionId + sessionToken plaintext.
Server stores hash in Y.Doc and plaintext in session registry.

## Implementation Steps
1. Update SetSessionTokenRequestSchema to add sessionId and sessionToken fields
2. Update setSessionTokenHandler to store plaintext in session registry
3. Update review-status.ts to pass these fields
4. Update getSessionState/setSessionState calls in review-status.ts to use in-memory map or server API
