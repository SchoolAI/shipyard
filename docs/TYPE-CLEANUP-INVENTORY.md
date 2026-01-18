# Type Cleanup Inventory: Discriminated Union Candidates

Issue #77 - Full inventory of types that should be refactored to discriminated unions.

**Date:** 2026-01-17
**Status:** Inventory complete, ready for implementation

---

## Summary

| Priority | Package/App | Count | Impact |
|----------|-------------|-------|--------|
| **HIGH** | packages/schema | 3 | Shared across entire codebase |
| **HIGH** | apps/server | 4 | API boundaries, hook handlers |
| **MEDIUM** | packages/schema | 5 | Moderate usage |
| **MEDIUM** | apps/web | 5 | UI state management |
| **MEDIUM** | apps/server | 3 | Internal types |
| LOW | various | ~8 | Optional config or limited scope |

---

## HIGH PRIORITY (Must Fix)

These types are used across the codebase and have clear discriminant candidates.

### 1. `PlanMetadata` — packages/schema/src/plan.ts:208-262

**Optional Fields:** 18
**Existing Discriminant:** `status: PlanStatusType`
**Impact:** Used everywhere - server, web, hooks, tools

**Current Structure:**
```typescript
export interface PlanMetadata {
  id: string;
  title: string;
  status: PlanStatusType;  // ← Already a discriminant!
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
  reviewedAt?: number;       // Only when reviewed
  reviewedBy?: string;       // Only when reviewed
  reviewComment?: string;    // Only when reviewed
  completedAt?: number;      // Only when completed
  completedBy?: string;      // Only when completed
  snapshotUrl?: string;      // Only when completed
  ownerId?: string;
  approvalRequired?: boolean;
  approvedUsers?: string[];
  rejectedUsers?: string[];
  sessionTokenHash?: string;
  archivedAt?: number;       // Always with archivedBy
  archivedBy?: string;       // Always with archivedAt
  origin?: OriginMetadata;
  viewedBy?: Record<string, number>;
  reviewRequestId?: string;  // Only pending_review
  conversationVersions?: ConversationVersion[];
  events?: PlanEvent[];
}
```

**Suggested Refactor:**
```typescript
// Base fields present in all variants
interface PlanMetadataBase {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
  ownerId?: string;
  approvalRequired?: boolean;
  approvedUsers?: string[];
  rejectedUsers?: string[];
  sessionTokenHash?: string;
  archivedAt?: number;
  archivedBy?: string;
  origin?: OriginMetadata;
  viewedBy?: Record<string, number>;
  conversationVersions?: ConversationVersion[];
  events?: PlanEvent[];
}

// Status-discriminated variants
type PlanMetadata =
  | (PlanMetadataBase & { status: 'draft' })
  | (PlanMetadataBase & { status: 'pending_review'; reviewRequestId: string })
  | (PlanMetadataBase & { status: 'changes_requested'; reviewedAt: number; reviewedBy: string; reviewComment?: string })
  | (PlanMetadataBase & { status: 'in_progress'; reviewedAt: number; reviewedBy: string })
  | (PlanMetadataBase & { status: 'approved'; reviewedAt: number; reviewedBy: string })
  | (PlanMetadataBase & { status: 'completed'; completedAt: number; completedBy: string; snapshotUrl?: string });
```

---

### 2. `PlanEvent` — packages/schema/src/plan.ts:145-169

**Optional Fields:** 10+ in loose `data` object
**Existing Discriminant:** `type: PlanEventType` (21 values)
**Impact:** Event handling, timeline, inbox logic

**Current Structure:**
```typescript
export interface PlanEvent {
  id: string;
  type: PlanEventType;  // ← Already a discriminant!
  actor: string;
  timestamp: number;
  data?: {
    fromStatus?: PlanStatusType;
    toStatus?: PlanStatusType;
    artifactId?: string;
    commentId?: string;
    prNumber?: number;
    stepId?: string;
    completed?: boolean;
    conversationId?: string;
    messageCount?: number;
    [key: string]: unknown;  // ← Loses all type safety!
  };
  inboxWorthy?: boolean;
  inboxFor?: string | string[];
}
```

**Problem:** The `[key: string]: unknown` index signature defeats TypeScript.

**Suggested Refactor:**
```typescript
interface PlanEventBase {
  id: string;
  actor: string;
  timestamp: number;
  inboxWorthy?: boolean;
  inboxFor?: string | string[];
}

type PlanEvent =
  | (PlanEventBase & { type: 'status_changed'; data: { fromStatus: PlanStatusType; toStatus: PlanStatusType } })
  | (PlanEventBase & { type: 'artifact_uploaded'; data: { artifactId: string } })
  | (PlanEventBase & { type: 'comment_added' | 'comment_resolved'; data: { commentId: string } })
  | (PlanEventBase & { type: 'pr_linked'; data: { prNumber: number } })
  | (PlanEventBase & { type: 'step_completed'; data: { stepId: string; completed: boolean } })
  | (PlanEventBase & { type: 'conversation_imported' | 'conversation_exported'; data: { conversationId: string; messageCount: number } })
  | (PlanEventBase & { type: 'plan_created' | 'plan_approved' | 'plan_completed' | ... ; data?: undefined });
```

---

### 3. `InputRequest` — packages/schema/src/input-request.ts:27-55

**Optional Fields:** 5
**Existing Discriminants:** `type` AND `status`
**Impact:** User input system, MCP tools

**Current Structure:**
```typescript
export const InputRequestSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  message: z.string(),
  type: z.enum(['text', 'multiline', 'choice', 'confirm']),  // ← Discriminant 1
  options: z.array(z.string()).optional(),  // Required for 'choice'!
  defaultValue: z.string().optional(),
  status: z.enum(['pending', 'answered', 'cancelled']),  // ← Discriminant 2
  response: z.unknown().optional(),    // Only when answered
  answeredAt: z.number().optional(),   // Only when answered
  answeredBy: z.string().optional(),   // Only when answered
  timeout: z.number().int().optional(),
});
```

**Problem:** `options` is only validated at runtime for `type: 'choice'`, not at type level.

**Suggested Refactor:**
```typescript
// Type-discriminated for input type
const TextInputSchema = z.object({
  type: z.literal('text'),
  // ... common fields
  defaultValue: z.string().optional(),
});

const ChoiceInputSchema = z.object({
  type: z.literal('choice'),
  // ... common fields
  options: z.array(z.string()).min(1),  // Required!
});

// Status-discriminated for response state
const PendingRequestSchema = BaseSchema.extend({
  status: z.literal('pending'),
});

const AnsweredRequestSchema = BaseSchema.extend({
  status: z.literal('answered'),
  response: z.unknown(),
  answeredAt: z.number(),
  answeredBy: z.string(),
});
```

---

### 4. `SessionState` — apps/server/src/session-registry.ts:17-30

**Optional Fields:** 8
**Existing Discriminant:** None (needs one)
**Impact:** Server session lifecycle

**Current Structure:**
```typescript
export interface SessionState {
  planId: string;
  planFilePath?: string;
  createdAt: number;
  lastSyncedAt: number;
  contentHash?: string;
  sessionToken?: string;
  url?: string;
  approvedAt?: number;        // Only when approved
  deliverables?: Array<...>;  // Only when approved
  reviewComment?: string;     // Only when reviewed
  reviewedBy?: string;        // Only when reviewed
  reviewStatus?: string;      // Only when reviewed
}
```

**Suggested Refactor:**
```typescript
interface SessionStateBase {
  planId: string;
  planFilePath?: string;
  createdAt: number;
  lastSyncedAt: number;
}

type SessionState =
  | (SessionStateBase & { lifecycle: 'created' })
  | (SessionStateBase & { lifecycle: 'synced'; contentHash: string; sessionToken: string; url: string })
  | (SessionStateBase & { lifecycle: 'pending_review'; contentHash: string; sessionToken: string; url: string })
  | (SessionStateBase & { lifecycle: 'approved'; contentHash: string; sessionToken: string; url: string; approvedAt: number; deliverables: Array<...> })
  | (SessionStateBase & { lifecycle: 'reviewed'; reviewComment: string; reviewedBy: string; reviewStatus: string });
```

---

### 5. `InputRequestResponse` — apps/server/src/services/input-request-manager.ts:23-36

**Optional Fields:** 4
**Existing Discriminant:** `status` and `success`
**Impact:** Input request handling

**Current Structure:**
```typescript
export interface InputRequestResponse {
  success: boolean;
  response?: unknown;
  status: 'answered' | 'cancelled';
  answeredBy?: string;
  answeredAt?: number;
  reason?: string;
}
```

**Suggested Refactor:**
```typescript
type InputRequestResponse =
  | { success: true; status: 'answered'; response: unknown; answeredBy: string; answeredAt: number }
  | { success: false; status: 'cancelled'; reason: string };
```

---

### 6. `waitForApprovalHandler` return — apps/server/src/hook-handlers.ts:398-405

**Optional Fields:** 5
**Existing Discriminant:** `approved` boolean
**Impact:** Hook approval flow

**Suggested Refactor:**
```typescript
type ApprovalResult =
  | { approved: true; deliverables: Deliverable[]; reviewComment?: string; reviewedBy: string; status: 'in_progress' }
  | { approved: false; feedback: string; status: 'changes_requested' | 'timeout' };
```

---

### 7. `getSessionContextHandler` return — apps/server/src/hook-handlers.ts:760-768

**Optional Fields:** 7 (ALL optional)
**Existing Discriminant:** None (needs one)
**Impact:** Session context retrieval

**Suggested Refactor:**
```typescript
type SessionContextResult =
  | { found: true; planId: string; sessionToken: string; url: string; deliverables: Array<...>; reviewComment?: string; reviewedBy?: string; reviewStatus?: string }
  | { found: false };
```

---

## MEDIUM PRIORITY

These have clear improvement opportunities but more limited scope.

### packages/schema

| Type | File:Line | Optional Fields | Discriminant |
|------|-----------|-----------------|--------------|
| `InviteRedemptionResult` | invite-token.ts:105 | 2 | `success` boolean |
| `ChangesResponse` | trpc/schemas.ts:68 | 4 | `ready` boolean |
| `ImportConversationResponse` | trpc/schemas.ts:134 | 4 | `success` boolean |
| `ConversationVersion` | plan.ts:99 | 2 | Add `handedOff` boolean |
| `PlanIndexEntry` | plan-index.ts:31 | 2 | Add `deleted` boolean |

### apps/server

| Type | File:Line | Optional Fields | Discriminant |
|------|-----------|-----------------|--------------|
| `ChangesResponse` | subscriptions/types.ts:32 | 4 | `ready` boolean |
| `Change` | subscriptions/types.ts:15 | 1 (`details`) | `type` exists |
| `addArtifact` opts | execute-code.ts:353 | 4 | Add `source` discriminant |

### apps/web

| Type | File:Line | Optional Fields | Discriminant |
|------|-----------|-----------------|--------------|
| `TransferProgress` | useConversationTransfer.ts:57 | 4 | `stage` exists |
| `ExportResult`/`ImportResult` | useConversationTransfer.ts:94 | 4 each | `success` boolean |
| `FetchArtifactResult` | github-artifact-fetcher.ts:15 | 3 | `status` exists |
| `PlanContentProps` | PlanContent.tsx:47 | 6 | Add `mode` discriminant |
| `PlanAwarenessState` | useMultiProviderSync.ts:60 | 3 | `status` exists |

---

## LOW PRIORITY (Skip or Defer)

These are intentionally flexible or have limited benefit:

| Type | Location | Reason to Skip |
|------|----------|----------------|
| `ShortcutHandlers` | web/useKeyboardShortcuts.ts | Intentionally all-optional "pick what you need" |
| `Artifact` | schema/plan.ts:295 | Optional fields are progressive filling |
| `PlanSnapshot` | schema/plan.ts:353 | Optional data that may not exist |
| `CreateInviteRequest` | schema/invite-token.ts:66 | Optional config with defaults |
| `CollapsiblePanelProps` | web/collapsible-panel.tsx | UI props with sensible defaults |
| `KanbanCardProps` | web/KanbanCard.tsx | Independent optional behaviors |

---

## Already Well-Designed (Good Examples)

Reference these for implementation patterns:

| Type | Location | Pattern |
|------|----------|---------|
| `OriginMetadata` | schema/plan.ts:63-68 | Discriminated by `platform` |
| `AuthState` | web/useGitHubAuth.ts:23-27 | Discriminated by `status` |
| `TokenValidationResult` | web/github-web-flow.ts:102 | Discriminated by `status` |
| `DecodedP2PMessage` | schema/p2p-messages.ts:258 | Discriminated by `type` |
| `BlockOperationSchema` | server/update-block-content.ts:20 | Zod `discriminatedUnion` |
| `UrlEncodedPlan` | schema/url-encoding.ts:80 | Discriminated by `v` |

---

## Implementation Order

Recommended sequence for maximum impact:

1. **PlanEvent** — Eliminates `[key: string]: unknown`, biggest type safety win
2. **PlanMetadata** — Most widely used, but larger surface area
3. **InputRequest** — Clean schema improvement
4. **Server response types** — API boundary improvements
5. **Web UI types** — Lower impact, can be batched

---

## Notes

- All refactors should include Zod schema updates where applicable
- Existing discriminant fields (`status`, `type`, `success`) should be leveraged
- Some types need a NEW discriminant field added (e.g., `SessionState` needs `lifecycle`)
- Follow the `assertNever` pattern from engineering-standards.md for exhaustive switches
