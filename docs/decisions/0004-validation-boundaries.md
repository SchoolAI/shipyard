# ADR 0004: Validation Boundaries

## Status

**Accepted** (2026-01-19)

## Context

We have three potential validation points in the data flow for plan data:

1. **External APIs** — GitHub API responses (PRs, repos, comments)
2. **Helper Function Parameters** — Data entering Y.Doc via helpers (linkPR, addArtifact, completeTask, updateBlockContent)
3. **CRDT Peer-to-Peer Sync** — Updates from remote browsers via y-webrtc or future P2P protocols

The question: Where should we validate to catch errors early, prevent invalid state, and maintain type safety?

**Current situation:**
- External API data sometimes has unexpected shapes (GitHub API versioning, null fields)
- Helper functions manipulate Y.Map/Y.Array directly — can encode invalid discriminated unions
- P2P sync is not yet implemented (browser-only sync currently via y-websocket)
- TypeScript alone cannot enforce Y.Map types at runtime (proven by handedOff bug in Phase 1.2)

**Constraints:**
- Validation is expensive (parsing, serialization, copying data)
- P2P validation is complex (requires understanding Yjs binary encoding)
- We need early error detection without over-validating

## Decision

**Validate at boundaries 1 and 2. Defer boundary 3.**

### Boundary 1: External APIs (GitHub)

**Decision:** Validate with Zod schemas immediately after API calls.

**Rationale:**
- External APIs are outside our control — data structure can change
- GitHub API returns unexpected nulls, optional fields, or legacy formats
- Early validation prevents downstream bugs where we assume fields exist
- Errors surface at the point of integration (easier to debug)

**Implementation:**
```typescript
// At call site in execute-code.ts or similar
const response = await fetch(githubUrl);
const data = await response.json();
const validated = GitHubPRResponseSchema.parse(data); // Throws if invalid
return validated; // Guaranteed valid
```

**Schema pattern:**
- Use `.parse()` (throws on invalid — we want loud failures here)
- Create schemas in packages/schema for reusability
- Document what fields are required vs optional in schema comments

### Boundary 2: Helper Function Parameters

**Decision:** Validate params in helper functions before writing to Y.Map/Y.Array.

**Rationale:**
- Helper functions are public APIs that other code calls
- Catches programmer errors before corrupting the CRDT document
- Prevents invalid discriminated unions (e.g., handedOff=true with null approvalUrl)
- Errors surface near the bug (inside the helper that was misused)
- Enables confident Y.Map access in other code without defensive checks

**Implementation:**
```typescript
// In packages/schema/src/yjs-helpers.ts
export function linkPR(ymap: Y.Map<any>, data: unknown) {
  const validated = LinkPRInputSchema.parse(data); // Throws if invalid
  ymap.set('pr', {
    number: validated.number,
    status: validated.status,
    // ...
  });
}
```

**Schema pattern:**
- Use `.parse()` (throws on invalid — programmer error if this fails)
- Schemas validate the exact shape before writing to Y.Doc
- Schema name pattern: `{HelperName}InputSchema` for clarity

### Boundary 3: CRDT Peer-to-Peer Sync

**Decision:** DEFER — rely on safeParse at read time as defense-in-depth.

**Rationale:**
- **Low likelihood of corruption:**
  - Yjs handles binary encoding with checksums
  - Corruption would require Byzantine peer or network bit-flip
  - Currently browser-only (no untrusted P2P network)
- **High effort for marginal gain:**
  - Validating binary CRDT updates requires parsing Yjs encoding
  - Must validate every update frame (performance hit)
  - Cannot inspect update semantics without replaying state
- **P2P not yet implemented:**
  - Future phase (milestone 1.4+)
  - Threat model different when peers are truly distributed
  - Can revisit decision when P2P is enabled
- **Read-time safeParse is defense-in-depth:**
  - When reading from Y.Map, use `.safeParse()` to catch corruption
  - Allows graceful degradation (skip invalid blocks, log warning)
  - Catches issues from Boundary 1 or 2 that somehow escaped

**Implementation:**
```typescript
// When reading plan data
function getPlanMetadata(ymap: Y.Map<any>) {
  const data = ymap.get('metadata');
  const result = PlanMetadataSchema.safeParse(data);

  if (!result.success) {
    logger.error('Invalid plan metadata', result.error);
    // Return defaults or skip this data
    return getDefaultMetadata();
  }
  return result.data; // Guaranteed valid
}
```

## Consequences

### Positive

- **High ROI validation:** Focused on controllable boundaries (external APIs + helper functions)
- **Errors surface at write time:** Near the code that caused the bug (clear debugging)
- **Clear error messages:** Type-safe helpers with validation improve DX for future code
- **Performance:** Only validates at integration points, not on every CRDT update
- **Layered defense:** Read-time safeParse catches any corruption despite other layers
- **Maintainable:** Two clear validation zones instead of three dispersed checks

### Negative

- **CRDT peer corruption theoretically possible:** Malicious peer could send invalid updates (mitigated by read-time safeParse)
- **Must trust Yjs sync protocol:** No additional guarantees beyond Yjs's internal checks
- **P2P phase may require reconsideration:** When true P2P is enabled, threat model changes

### Mitigations

- **Read-time validation:** safeParse acts as safety net for any corruption
- **Logging:** Add structured logs when read-time validation fails (detect patterns early)
- **Future monitoring:** Track validation failures in production (signals for infrastructure issues)
- **Revisit plan:** When P2P sync is enabled, explicitly reconsider based on actual threat model

## Alternatives Considered

### 1. Validate all three boundaries

**Approach:** Add validation middleware to Yjs sync (validate every update).

**Rejected because:**
- Effort: 8-12 hours to understand Yjs encoding and build middleware
- Performance: 5-10ms overhead per update frame
- Low probability bug (Yjs has been reliable, current setup is browser-only)
- Better to validate external APIs (high probability bugs) first
- Can be added later if P2P threat model justifies it

### 2. Validate only external APIs (skip Boundary 2)

**Approach:** Rely on TypeScript types for helper function validation.

**Rejected because:**
- TypeScript types are compile-time only (don't enforce Y.Map structure)
- Phase 1.2 bug proved discriminated unions can become invalid at runtime
- Helpers are public APIs — should validate their contracts
- Effort is low (one parse per helper call)

### 3. No validation, rely on TypeScript type system

**Approach:** Trust TypeScript strict mode to prevent invalid data.

**Rejected because:**
- Phase 1.2 handedOff bug is counter-example (TypeScript couldn't prevent it)
- Y.Map values are not strongly typed by TypeScript (cast-based, unsafe)
- External APIs return `unknown` (no compile-time type guarantee)
- Validation cost is low, benefit is high

## Implementation Notes

- **External validation uses `.parse()`:** Throw on invalid (external errors, loud failure)
- **Helper validation uses `.parse()`:** Throw on invalid (programmer error, loud failure)
- **Read validation uses `.safeParse()`:** Filter invalid (defense-in-depth, graceful degradation)

**Error messages should include:**
- What data was invalid (field name, value)
- What was expected (schema description)
- Where to fix (which file/function)

**Logging should track:**
- How often each validation fails
- Which boundaries produce errors (indicates where to investigate)

## Related

- **ADR-0001:** Choice to use Yjs (establishes need for runtime validation of Y.Map)
- **Phase 1.2 incident:** handedOff bug (demonstrated TypeScript limitation)
- **Engineering standards:** Y.Doc validation patterns in docs/engineering-standards.md
- **Implementation:** packages/schema/src/yjs-helpers.ts (helper validation)
- **Implementation:** apps/server/src/tools/execute-code.ts (external API validation)

## Revisit Criteria

Reconsider this decision if:
- **P2P sync is enabled** and threat model requires validation of untrusted peers
- **CRDT corruption is detected** in production (signals that defense-in-depth is insufficient)
- **Performance issues** arise from validation overhead (can add caching/debouncing)
- **Validation failures spike** in logs (indicates systematic issue with data sources)

---

*Created: 2026-01-19*
