# Milestone 0: Foundation

**Status**: Not Started
**Goal**: Project scaffold, schemas, and URL encoding library

---

## Overview

This milestone establishes the foundational pieces that everything else builds on:
- Monorepo structure
- Shared TypeScript schemas
- URL encoding/decoding library

---

## Deliverables

### 0a: Project Scaffold

- [ ] Initialize pnpm workspace monorepo
- [ ] Configure TypeScript (strict mode)
- [ ] Set up shared tsconfig
- [ ] Create package structure:
  ```
  peer-plan/
  ├── packages/
  │   ├── schema/     # Shared types + loro Shape definitions
  │   ├── server/     # MCP server (future)
  │   └── web/        # React app (future)
  ├── docs/           # Documentation
  │   └── original-vision/ # Original design docs (historical)
  └── spikes/         # Proof of concept code
  ```

### 0b: Schema Definitions

- [ ] Define `UrlEncodedPlan` interface (what goes in URL)
- [ ] Define `LiveStateSchema` (loro Shape for CRDT state)
- [ ] Define artifact types
- [ ] Export TypeScript types for use in server/web
- [ ] Write unit tests for type guards/validation

**Key schema questions to resolve:**
- Plan ID: Hash of content? UUID? Format?
- Title: Mutable or immutable?
- Steps: Mutable or immutable?
- What's the minimum viable schema to start?

### 0c: URL Encoding Library

- [ ] Install `lz-string`
- [ ] Implement `encodePlan(plan: UrlEncodedPlan): string`
- [ ] Implement `decodePlan(url: string): UrlEncodedPlan | null`
- [ ] Handle version field for forward compatibility
- [ ] Write comprehensive tests:
  - [ ] Round-trip encoding
  - [ ] Unicode handling
  - [ ] Special characters
  - [ ] Maximum size scenarios
  - [ ] Invalid input handling
  - [ ] Version mismatch handling

---

## Success Criteria

1. `pnpm build` succeeds across all packages
2. Schema types can be imported from `@peer-plan/schema`
3. URL encoding round-trips correctly with various inputs
4. Tests pass

---

## Technical Notes

### URL Encoding Approach

```typescript
import lzstring from 'lz-string';

interface UrlEncodedPlan {
  v: 1;  // Version
  id: string;
  repo: string;
  pr: number;
  title: string;
  steps: Array<{ id: string; title: string; desc: string }>;
  artifacts: Array<{ id: string; type: string; file: string }>;
  // Snapshot of mutable state (optional)
  annotations?: Array<{ ... }>;
  status?: string;
}

export function encodePlan(plan: UrlEncodedPlan): string {
  const json = JSON.stringify(plan);
  return lzstring.compressToEncodedURIComponent(json);
}

export function decodePlan(encoded: string): UrlEncodedPlan | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const plan = JSON.parse(json);
    // Validate version and schema
    if (plan.v !== 1) {
      console.warn(`Unknown plan version: ${plan.v}`);
    }
    return plan;
  } catch {
    return null;
  }
}
```

### loro Shape Definition

```typescript
import { Shape } from '@loro-extended/repo';

export const LiveStateSchema = Shape.doc({
  planId: Shape.plain.string(),

  // Mutable state
  stepStatus: Shape.record(Shape.plain.boolean()),
  reviewStatus: Shape.plain.string(),

  annotations: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      stepId: Shape.plain.string().nullable(),
      author: Shape.plain.string(),
      type: Shape.plain.string(),
      content: Shape.plain.string(),
      createdAt: Shape.plain.number(),
      resolved: Shape.plain.boolean(),
    })
  ),
});
```

---

## Dependencies

- None (this is the foundation)

## Blocks

- Milestone 1 (MCP Server)
- Milestone 2 (View Plans)

---

*Created: 2026-01-02*
