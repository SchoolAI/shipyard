---
name: engineering-standards
description: "Expert at Shipyard's engineering quality gates and enforcement chain. Use when reviewing code, checking quality, running pre-commit validation, verifying test coverage, or ensuring compliance with comment style, type assertion rules, fan-in coverage, meta-tests, and strict TypeScript. Use for code reviews, PR reviews, and post-implementation QA."
---

# Engineering Standards Enforcer

A **process/workflow skill** for verifying code against Shipyard's automated enforcement chain. Not a domain skill -- this tells you what gates exist, how to pass them, and how to diagnose failures.

## The Enforcement Pipeline

```
commit attempt
  |
  v
[1] simple-git-hooks --> pnpm check
  |
  +--> [2] validate-file-allowlist.sh    (blocks unapproved .md/.txt)
  |
  +--> turbo run typecheck lint (filtered)
         |
         +--> [3] TypeScript strict        (tsconfig.base.json)
         +--> [4] Biome linter             (biome.json)
         |
         |  (not in pre-commit, run manually or in CI)
         |
         +--> [5] ESLint: comments         (scripts/lint-comments.sh)
         +--> [6] ESLint: type assertions  (scripts/lint-typeassertions.sh)
         |
  +--> [7] Fan-in coverage               (vitest + analyze-fan-in.ts)
  +--> [8] Meta-tests                    (tests/integration-coverage.test.ts)
```

## Quick: Check Your Code

```bash
# Full pre-commit check (what the hook runs)
pnpm check

# Individual gates
pnpm lint                          # Biome
pnpm typecheck                     # TypeScript strict
pnpm lint:comments                 # Comment style (ESLint)
pnpm lint:typeassertions           # No `as X` (ESLint)
pnpm test:meta                     # Meta-test (test existence)
pnpm test                          # Full test suite (includes fan-in + meta)
```

## Common Violations and Fixes

### `noExplicitAny` (Biome)
```typescript
/** BAD */
function parse(data: any) {}

/** GOOD -- use unknown + type guard */
function parse(data: unknown): Result {
  const parsed = schema.parse(data);
  return parsed;
}
```

### No type assertions (ESLint)
```typescript
/** BAD */
const user = data as User;

/** GOOD -- Zod parse */
const user = userSchema.parse(data);

/** GOOD -- type guard */
if (isUser(data)) { /* data is User */ }

/** ALLOWED */
const config = { theme: 'dark' } as const;
switch (action.kind) { default: return assertNever(action as never); }
```

### No noisy comments (ESLint)
```typescript
/** BAD */
// Loop through items
// Return the result
/* Calculate total */

/** GOOD -- directives */
// TODO: refactor this
// @ts-expect-error -- upstream type bug
// biome-ignore lint/suspicious/noExplicitAny: FFI boundary

/** GOOD -- JSDoc for WHY */
/** Max 50 to prevent Firestore quota issues */
```

### `noUncheckedIndexedAccess` (TypeScript)
```typescript
/** BAD -- items[0] is T | undefined, not T */
const first = items[0];
first.name; // TS error

/** GOOD */
const first = items[0];
if (first) { first.name; }
```

### `noConsole` (Biome)
```typescript
/** BAD -- in app code */
console.log('debug');

/** GOOD -- use structured logger */
logger.info('operation completed', { taskId });
```
Off in `scripts/`, `spikes/`, and logger files.

### File allowlist violation
New `.md` or `.txt` file not in `scripts/validate-file-allowlist.sh` allowlist.
Fix: add to `ALLOWED_DOCS` or `ALLOWED_SCRIPTS` array (requires user approval), or move to `docs/whips/` (sandbox) or `spikes/` (POC).

### Missing integration test (meta-test)
New route/tool file in a covered directory without a `.test.ts` companion.
Fix: create the test file. The meta-test tells you the exact path.

## Deep Reference

- **[reference.md](./reference.md)** -- Every rule, its severity, config file, and fix
- **[patterns.md](./patterns.md)** -- Session server case study, adding new routes/tools/packages, review checklist
