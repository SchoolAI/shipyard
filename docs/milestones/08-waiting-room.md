# Milestone 8: Waiting Room & Access Control

**Status**: In Progress
**Goal**: Zoom-like approval flow for shared plans

---

## Overview

When someone opens a shared plan URL, they should be placed in a "waiting room" until the owner approves them. This provides:
1. **Security** - Plan content isn't visible until approved
2. **Clear ownership** - One person owns the plan, others are guests
3. **Familiar UX** - Same pattern as Zoom meetings

---

## User Flow

```
1. Owner creates plan via MCP server
   └── Plan appears in "My Plans"

2. Owner shares URL with collaborator

3. Collaborator opens URL
   └── Sees "Waiting Room" UI:
       - Plan title (visible)
       - Owner name (visible)
       - "Waiting for approval..." message
       - Plan content (NOT visible)

4. Owner sees notification
   └── "Alice wants to join this plan"
       - [Approve] button
       - [Deny] button

5. Owner clicks Approve
   └── Collaborator gains full access
   └── Plan appears in collaborator's "Shared with me"

6. OR Owner clicks Deny
   └── Collaborator sees "Access Denied"
```

---

## Architecture

### Key Insight: Gate at Signaling Layer

The signaling server controls who can sync CRDT data. By checking approval status before relaying document updates, we enforce access control server-side (can't be bypassed by client).

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPROVAL ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Signaling Server (Cloudflare Worker)                           │
│  ├── Receives WebRTC signaling messages                         │
│  ├── Checks approval status before relaying CRDT updates        │
│  ├── Always allows awareness (presence) messages                │
│  └── Stores approval state in Durable Objects                   │
│                                                                 │
│  Yjs Awareness Protocol                                         │
│  ├── Used for: Presence, pending status, approval broadcasts    │
│  ├── Always synced (even for pending users)                     │
│  └── ~200ms latency for state changes                           │
│                                                                 │
│  Yjs CRDT Document                                              │
│  ├── Contains: Plan content, metadata, comments                 │
│  ├── Gated: Only synced to approved users                       │
│  └── approvedUsers list stored in metadata                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deliverables

### Phase 1: Schema & Metadata

- [x] Add to `PlanMetadata` in `packages/schema/src/plan.ts`:
  ```typescript
  ownerId: string;           // User ID of plan creator
  approvalRequired: boolean; // Default: true
  approvedUsers: string[];   // User IDs who have been approved
  ```

- [x] Add helper functions in `packages/schema/src/yjs-helpers.ts`:
  ```typescript
  approveUser(ydoc, userId): void
  revokeUser(ydoc, userId): void
  isUserApproved(ydoc, userId): boolean
  getApprovedUsers(ydoc): string[]
  ```

- [x] Update `initPlanMetadata` to set `ownerId` from current user

### Phase 2: Awareness Protocol Extension

- [x] Define awareness state shape:
  ```typescript
  interface PlanAwarenessState {
    user: {
      id: string;
      name: string;
      color: string;
    };
    status: 'pending' | 'approved' | 'rejected';
    isOwner: boolean;
    requestedAt?: number;
  }
  ```

- [x] Update `useMultiProviderSync` to:
  - Set local awareness state on connect
  - Listen for approval broadcasts from owner
  - Track `approvalStatus` in `SyncState`

- [x] Add `useApprovalStatus` hook for easy access

### Phase 3: Waiting Room UI

- [x] Create `WaitingRoomGate.tsx` component:
  ```typescript
  // Wraps plan content, shows waiting room if not approved
  <WaitingRoomGate planId={planId} syncState={syncState}>
    <PlanViewer ... />
  </WaitingRoomGate>
  ```

- [x] Waiting room shows:
  - Plan title
  - Owner name
  - "Waiting for approval..." with spinner
  - Option to cancel/leave

- [x] "Access Denied" state for rejected users
  - Added `rejectedUsers` array to PlanMetadata
  - `rejectUser()` helper to add users to rejected list
  - `isUserRejected()` helper to check rejection status
  - `computeApprovalStatus()` checks rejected list first

### Phase 4: Owner Approval Panel

- [x] Create `ApprovalPanel.tsx` component:
  - Lists pending users (from awareness via `usePendingUsers` hook)
  - [Approve] / [Deny] buttons for each
  - Shows as popover in header for owner only
  - Uses HeroUI Avatar, Button, Popover components

- [x] Approval actions:
  - `approveUser()` adds user to `approvedUsers` in metadata (persistent)
  - `rejectUser()` adds user to `rejectedUsers` in metadata (persistent)
  - Changes sync via CRDT and user status updates immediately

- [x] Notification when new user requests access:
  - Toast notification via `usePendingUserNotifications` hook
  - Badge/indicator shows pending count in header
  - 10-second toast with "View" action to open panel

### Phase 5: Signaling Server Enforcement

- [ ] Modify Cloudflare signaling server:
  ```typescript
  // In handlePublish()
  if (isPlanDocument(topic)) {
    const isApproved = await checkApproval(planId, userId);
    if (!isApproved) {
      // Don't relay CRDT updates
      return;
    }
  }
  // Always allow awareness messages
  ```

- [ ] Store approval state in Durable Objects:
  - Plan ID -> { ownerId, approvedUsers }
  - Sync from CRDT metadata on first connect

- [ ] Handle edge cases:
  - Owner reconnects (re-establish as owner)
  - Approved user reconnects (verify still approved)
  - Revocation while connected

### Phase 6: MCP Server Integration

- [x] `create_plan` tool sets `ownerId` automatically
- [ ] New `approve_user` tool for CLI approval
- [ ] New `list_pending` tool to see pending users

---

## Security Considerations

### Server-Side Enforcement
- Signaling server is the gatekeeper
- Client code can be modified but can't bypass server
- CRDT updates only relayed to approved users

### Awareness vs. CRDT
- Awareness: Always synced (presence only, no sensitive data)
- CRDT: Gated (contains actual plan content)
- Even malicious client can only see who else is waiting

### Timing Attacks
- Connection timing is identical for approved/pending
- Gating happens after WebRTC established
- No information leakage via connection behavior

### Revocation
- Removing from `approvedUsers` takes effect on next message
- Signaling server checks on every publish
- No cached access after revocation

---

## Open Questions

1. **Auto-approve known users?**
   - Could store "trusted users" list
   - Auto-approve if they've been approved before

2. **Expiring approvals?**
   - Should approval expire after X days?
   - Or permanent until revoked?

3. **Approval by link?**
   - Generate special links that auto-approve?
   - Like Zoom "passcode" in URL

4. **Multiple owners?**
   - Can owner delegate approval rights?
   - Or single owner only?

---

## Technical Notes

### Why Awareness for Pending Status

Yjs awareness protocol is perfect for this because:
1. **Instant** - ~200ms propagation vs CRDT transaction overhead
2. **Ephemeral** - Pending status doesn't need persistence
3. **Already available** - Our WebRTC provider includes it
4. **Lightweight** - Small state, frequent updates OK

### Signaling Server State

Cloudflare Durable Objects provide:
- Per-plan state storage
- Consistent reads within same DO
- WebSocket integration
- Global distribution

### Backward Compatibility

Plans without `approvalRequired` work as today:
- Check `if (!metadata.approvalRequired)` → skip waiting room
- Existing plans continue working
- Can enable approval on existing plans

---

## Dependencies

- Milestone 6 (P2P) - WebRTC infrastructure
- Milestone 5 (Review Flow) - Identity system

## Blocks

- Nothing (additive feature)

---

## Estimated Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| Phase 1: Schema | 2-3 hours | Straightforward additions |
| Phase 2: Awareness | 4-6 hours | Core sync logic |
| Phase 3: Waiting Room UI | 3-4 hours | New components |
| Phase 4: Approval Panel | 4-6 hours | Owner controls |
| Phase 5: Signaling Server | 6-8 hours | Critical path |
| Phase 6: MCP Integration | 2-3 hours | Tool additions |

**Total: ~3-4 days of focused work**

---

*Created: 2026-01-07*
