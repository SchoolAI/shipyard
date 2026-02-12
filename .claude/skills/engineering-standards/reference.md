# Engineering Standards — Complete Rule Reference

## Gate 1: Pre-commit Hook

**Config:** `package.json` > `simple-git-hooks.pre-commit`
**Runs:** `pnpm check` = `bash scripts/validate-file-allowlist.sh && turbo run typecheck lint --filter='!@shipyard/session-server' --filter='!@shipyard/hook'`

Blocks commit if any gate fails. Session server and hook are filtered out (separate CI).

---

## Gate 2: File Allowlist

**Config:** `scripts/validate-file-allowlist.sh`
**Severity:** Error (blocks commit)

| What | Rule |
|---|---|
| `.md` / `.txt` files | Must be in `ALLOWED_DOCS` array |
| `scripts/*` files | Must be in `ALLOWED_SCRIPTS` array |
| `docs/whips/*` | Exempt (sandbox) |
| `spikes/*` | Exempt (POC) |
| `node_modules/`, `.git/`, `dist/` | Excluded from scan |

**Fix:** Add to allowlist (requires user approval), move to `docs/whips/`, or delete.

---

## Gate 3: TypeScript Strict

**Config:** `tsconfig.base.json`
**Severity:** Error (blocks commit via `turbo run typecheck`)

### strict: true (enables all of these)
| Flag | Effect |
|---|---|
| `strictNullChecks` | `null`/`undefined` not assignable to other types |
| `strictFunctionTypes` | Contravariant parameter checking |
| `strictBindCallApply` | Check `bind`/`call`/`apply` arguments |
| `strictPropertyInitialization` | Class properties must be initialized |
| `noImplicitAny` | Error on implicit `any` |
| `noImplicitThis` | Error on implicit `this` type |
| `alwaysStrict` | Emit `"use strict"` |
| `useUnknownInCatchVariables` | `catch(e)` is `unknown`, not `any` |

### Additional strict flags
| Flag | Effect |
|---|---|
| `noUncheckedIndexedAccess` | `array[0]` is `T \| undefined` |
| `noImplicitOverride` | Must use `override` keyword |
| `noFallthroughCasesInSwitch` | Every `case` must `break`/`return` |
| `noImplicitReturns` | All code paths must return |
| `noUnusedLocals` | Error on unused variables |
| `noUnusedParameters` | Error on unused parameters |
| `allowUnusedLabels: false` | Error on unused labels |
| `allowUnreachableCode: false` | Error on unreachable code |

### Module strictness
| Flag | Effect |
|---|---|
| `isolatedModules` | Each file must be independently transpilable |
| `verbatimModuleSyntax` | `import type` required for type-only imports |
| `forceConsistentCasingInFileNames` | Case-sensitive file references |

---

## Gate 4: Biome Linter

**Config:** `biome.json`
**Severity:** Error unless noted
**Formatter:** 2 spaces, single quotes, trailing commas (es5), semicolons always, line width 100

### Core rules

| Rule | Severity | Catches |
|---|---|---|
| `noExplicitAny` | error | `any` type annotations |
| `noImplicitAnyLet` | error | `let x;` without type |
| `noNonNullAssertion` | error | `x!` postfix assertions |
| `noExcessiveCognitiveComplexity` | error | Deeply nested/branching logic |
| `noConsole` | error | `console.log` etc. |
| `noDangerouslySetInnerHtml` | error | XSS vector |
| `noAccumulatingSpread` | error | Spread in loops (O(n^2)) |
| `noDoubleEquals` | error | `==` instead of `===` |
| `useImportType` | error | Missing `import type` for type-only |
| `useNodejsImportProtocol` | error | `import fs` instead of `import fs from 'node:fs'` |
| `useTemplate` | error | String concat instead of template literals |
| `noUnusedImports` | error | Dead imports |
| `noUnusedVariables` | warn | Unused variables |
| `noUnusedFunctionParameters` | warn | Unused parameters |
| `noVar` | error | `var` declarations |
| `noDebugger` | error | `debugger` statements |
| `noAssignInExpressions` | error | Assignment in conditions |
| `noBannedTypes` | error | `Object`, `Function`, etc. |

### Overrides (relaxed rules)

| Context | Relaxation |
|---|---|
| `**/*.test.ts`, `**/*.spec.ts` | `noExplicitAny`: off, `noUnusedVariables`: off, `noNonNullAssertion`: off, `noExcessiveCognitiveComplexity`: warn |
| `**/scripts/*` | `noConsole`: off |
| `spikes/**` | `noConsole`: off, `noExplicitAny`: off, `noUnusedVariables`: off, `noUnusedFunctionParameters`: off |
| Logger files (explicit paths) | `noConsole`: off |
| MCP tools, loro code, agents, routes | `noExcessiveCognitiveComplexity`: warn (not error) |
| `**/*.css` | Linter and formatter disabled |

---

## Gate 5: ESLint — Comment Rules

**Config:** `eslint.config.mjs` (custom `local/no-noisy-single-line-comments` rule)
**Run:** `pnpm lint:comments` or `bash scripts/lint-comments.sh`
**Severity:** Error
**Scope:** All `.ts`/`.tsx` in `apps/` and `packages/` (excludes tests, configs, spikes)

### no-noisy-single-line-comments

**Blocks:** ALL `//` comments and single-line `/* */` comments

**Allowed exceptions:**

| Pattern | Example |
|---|---|
| `@ts-` prefix | `// @ts-expect-error -- reason` |
| `eslint-` prefix | `// eslint-disable-next-line rule-name` |
| `TODO` prefix | `// TODO: migrate this` |
| `FIXME` prefix | `// FIXME: race condition` |
| `NOTE` prefix | `// NOTE: intentional fallthrough` |
| `HACK` prefix | `// HACK: workaround for upstream bug` |
| `XXX` prefix | `// XXX: needs investigation` |
| `biome-ignore` prefix | `// biome-ignore lint/suspicious/noExplicitAny: reason` |
| Triple-slash `///` | `/// <reference types="..." />` |
| JSDoc `/** */` | Always allowed |
| Block comments in `.tsx` | Always allowed (JSX requires `{/* */}`) |
| Multi-line block comments | Always allowed |

### multiline-comment-style
**Rule:** `starred-block` -- multi-line comments must use `/** ... */` format

### spaced-comment
**Rule:** `always` -- space required after `//` or `/*`

---

## Gate 6: ESLint — Type Assertion Rules

**Config:** `eslint.config.mjs` (`no-restricted-syntax` selector)
**Run:** `pnpm lint:typeassertions` or `bash scripts/lint-typeassertions.sh`
**Severity:** Error
**Scope:** All `.ts`/`.tsx` in `apps/` and `packages/` (excludes tests, configs, spikes)

### Rule: No `as X` expressions

**Blocks:** All `TSAsExpression` nodes except:
- `as const` -- narrows to literal types
- `as never` -- exhaustive switch defaults

**Fix strategies (in order of preference):**
1. Type guards: `if (isUser(x)) { ... }`
2. Zod validation: `schema.parse(data)` returns typed result
3. Generics: `function get<T>(key: string): T`
4. Fix the types at source
5. Last resort: `// eslint-disable-next-line no-restricted-syntax -- reason`

---

## Gate 7: Fan-In Based Coverage

**Config:** `scripts/analyze-fan-in.ts`
**Integrated in:** `apps/server/vitest.config.ts`, `apps/session-server/vitest.config.ts`, `packages/loro-schema/vitest.config.ts`
**Disable:** `DISABLE_FANIN_COVERAGE=1`

### How it works

1. Scans all `.ts` files in `src/`
2. Counts runtime imports (type-only excluded) to each module
3. Assigns tiers based on fan-in count
4. Public API patterns get +10 virtual fan-in boost
5. Generates per-file Vitest coverage thresholds

### Tier assignments

| Tier | Fan-in | Coverage requirement |
|---|---|---|
| critical | 10+ | 60% branch |
| high | 5-9 | 60% branch |
| medium | 3-4 | 60% branch |
| low | 0-2 | Global 30% function floor only |

### Key detail
All tiers with fan-in >= 3 require the same 60% branch threshold. The tier names (critical/high/medium) exist for reporting -- the coverage bar is uniform once code becomes shared infrastructure.

---

## Gate 8: Meta-Tests

**Config:** `tests/integration-coverage.test.ts`
**Run:** `pnpm test:meta` or `vitest run tests/integration-coverage.test.ts`

### Covered directories

| Directory | Description | Required test suffix |
|---|---|---|
| `apps/session-server/src/routes` | Session server routes | `.test.ts` |
| `apps/server/src/http/routes` | HTTP routes | `.test.ts` |
| `apps/server/src/mcp/tools` | MCP tools | `.test.ts` |
| `packages/loro-schema/src` | `task-document.ts`, `room-document.ts` only | `.test.ts` |

### How it works

For each directory:
1. Scans for source files matching `sourcePattern`
2. For each source file `foo.ts`, checks if `foo.test.ts` exists
3. Fails with exact missing file paths if any test is absent

### Adding a new covered directory

Edit `COVERAGE_REQUIREMENTS` array in `tests/integration-coverage.test.ts`:
```typescript
{
  sourceDir: 'apps/my-app/src/routes',
  testSuffix: '.test.ts',
  sourcePattern: /^(?!.*\.test\.ts$).*\.ts$/,
  description: 'My App Routes',
},
```

---

## Formatter Rules (Biome)

| Setting | Value |
|---|---|
| Indent style | spaces |
| Indent width | 2 |
| Line width | 100 |
| Quote style | single |
| Trailing commas | es5 |
| Semicolons | always |

---

## File Naming Convention

All files use **kebab-case**: `user-profile.tsx`, `create-task.ts`, `use-auth.ts`.

Code naming: PascalCase (components/classes), camelCase (functions/variables), SCREAMING_SNAKE_CASE (constants).

---

## Exhaustive Type Pattern

Discriminated unions must use `assertNever()`:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unhandled: ${JSON.stringify(x)}`);
}

switch (action.kind) {
  case 'create': return handleCreate(action);
  case 'update': return handleUpdate(action);
  case 'delete': return handleDelete(action);
  default: return assertNever(action);
}
```

Adding a new variant breaks compilation until every switch handles it.
