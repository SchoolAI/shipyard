# Engineering Standards — Patterns & Case Study

## Case Study: Session Server (Gold Standard)

`apps/session-server/` demonstrates full compliance with every quality gate.

### What it has

- **6 route files**, each with a `.test.ts` companion:
  - `auth-github.ts` / `auth-github.test.ts`
  - `collab-create.ts` / `collab-create.test.ts`
  - `health.ts` / `health.test.ts`
  - `index.ts` / `index.test.ts`
  - `ws-collab.ts` / `ws-collab.test.ts`
  - `ws-personal.ts` / `ws-personal.test.ts`
- **100% route test coverage** (meta-test verified via `tests/integration-coverage.test.ts`)
- **Zero type errors** under strict TypeScript
- **Zero lint errors** (Biome + ESLint)
- **Fan-in coverage** integrated in `vitest.config.ts`
- **Zod schemas** for all request/response bodies (no `as X` needed)
- **Typed client** with full API surface
- **Route constants** centralized (single source of truth for paths)

### Why it passes every gate

1. **No `any`** -- Zod schemas provide runtime validation and static types simultaneously
2. **No type assertions** -- Zod `.parse()` returns typed results, no `as` needed
3. **No noisy comments** -- Code is self-documenting through naming
4. **No missing tests** -- Every route file has a companion test
5. **Fan-in coverage** -- High fan-in utilities have 60%+ branch coverage
6. **Strict TS** -- All parameters typed, all returns typed, no implicit anything

---

## Pattern: Adding a New Route

When you add a route to a meta-test-covered directory, you must create both files or the test suite fails.

### Step-by-step

1. **Create the route:** `apps/server/src/http/routes/my-route.ts`
2. **Create the test:** `apps/server/src/http/routes/my-route.test.ts`
3. **Use Zod for request/response schemas** (avoids `any` and `as X`)
4. **Run checks:**
   ```bash
   pnpm check              # pre-commit gates
   pnpm test:meta          # verify test exists
   pnpm lint:comments      # no noisy comments
   pnpm lint:typeassertions # no type assertions
   ```

### Route skeleton

```typescript
import { z } from 'zod';

const requestSchema = z.object({
  taskId: z.string(),
});

const responseSchema = z.object({
  success: z.boolean(),
});

export type MyRouteRequest = z.infer<typeof requestSchema>;
export type MyRouteResponse = z.infer<typeof responseSchema>;

export async function myRoute(req: Request): Promise<Response> {
  const body = requestSchema.parse(await req.json());
  /** Business logic */
  return Response.json({ success: true } satisfies MyRouteResponse);
}
```

Key points:
- `z.infer` gives you types without assertions
- `satisfies` checks the return without asserting
- No comments needed on self-documenting code

---

## Pattern: Adding a New MCP Tool

Same as routes -- `apps/server/src/mcp/tools/` is meta-test covered.

1. **Create:** `apps/server/src/mcp/tools/my-tool.ts`
2. **Create:** `apps/server/src/mcp/tools/my-tool.test.ts`
3. **Verify:** `pnpm test:meta`

---

## Pattern: Adding a New Package with Fan-In Coverage

1. **Create the package** under `packages/`
2. **Add vitest config** with fan-in integration:

```typescript
import { defineConfig } from 'vitest/config';
import { DEFAULT_TIER_THRESHOLDS, generateCoverageThresholds } from '../../scripts/analyze-fan-in';

/**
 * Fan-in based coverage thresholds.
 * Disable with: DISABLE_FANIN_COVERAGE=1
 */
const fanInEnabled = !process.env.DISABLE_FANIN_COVERAGE;
const fanInThresholds = generateCoverageThresholds('./src', DEFAULT_TIER_THRESHOLDS, fanInEnabled);

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        perFile: true,
        functions: 30,
        ...fanInThresholds,
      },
    },
  },
});
```

3. **Optionally add to meta-test** if the package has public interfaces:

Edit `tests/integration-coverage.test.ts` > `COVERAGE_REQUIREMENTS`:
```typescript
{
  sourceDir: 'packages/my-package/src',
  testSuffix: '.test.ts',
  sourcePattern: /^(my-public-module|other-module)\.ts$/,
  description: 'My Package Public Modules',
},
```

---

## Pattern: The Meta-Test System

### How meta-tests enforce test existence

`tests/integration-coverage.test.ts` is a Vitest test that scans directories:

```
COVERAGE_REQUIREMENTS array
  |
  v
For each requirement:
  1. Read all .ts files in sourceDir matching sourcePattern
  2. For each source.ts, check if source.test.ts exists
  3. Fail with exact missing paths if any absent
```

This runs as part of `pnpm test` -- no separate CI step needed.

### Currently covered directories

| Directory | Coverage |
|---|---|
| `apps/session-server/src/routes` | All route files |
| `apps/server/src/http/routes` | All HTTP route files |
| `apps/server/src/mcp/tools` | All MCP tool files |
| `packages/loro-schema/src` | `task-document.ts`, `room-document.ts` only |

### Adding a new covered directory

Add an entry to `COVERAGE_REQUIREMENTS` in `tests/integration-coverage.test.ts`. Use `sourcePattern` regex to filter which files need tests (default: all `.ts` except test files).

---

## Review Checklist

Use when reviewing PRs or doing post-implementation QA.

### Type safety
- [ ] No `any` in production code (allowed in tests)
- [ ] No `as X` assertions (only `as const` and `as never`)
- [ ] No `x!` non-null assertions in production code
- [ ] Discriminated unions use `assertNever()` in default case
- [ ] Array/object indexing handles `| undefined` from `noUncheckedIndexedAccess`
- [ ] `catch` variables handled as `unknown`

### Comments
- [ ] No `//` comments unless directive (`TODO`, `@ts-`, `biome-ignore`, etc.)
- [ ] No single-line `/* */` comments (use `/** */` JSDoc if needed)
- [ ] Any remaining comments explain WHY, not WHAT
- [ ] Multi-line comments use starred-block format

### Testing
- [ ] New route/tool in covered directory has `.test.ts` companion
- [ ] High fan-in utilities (3+ importers) have adequate branch coverage
- [ ] Tests verify behavior, not implementation details
- [ ] No test spam -- minimum tests to cover risk

### Files
- [ ] New `.md`/`.txt` files added to allowlist (with approval)
- [ ] File names use kebab-case
- [ ] `import type` used for type-only imports
- [ ] Node.js imports use `node:` protocol (`import fs from 'node:fs'`)

### Code style
- [ ] Biome formatter applied (2 spaces, single quotes, semicolons)
- [ ] No `console.log` in app code (use logger)
- [ ] No `var` declarations
- [ ] No `==` comparisons
- [ ] No accumulating spread in loops

### Architecture
- [ ] Pure functions preferred over stateful classes
- [ ] Dependencies injected, not imported from global state
- [ ] Public API at top of file, helpers at bottom
- [ ] Zod schemas for runtime validation boundaries
