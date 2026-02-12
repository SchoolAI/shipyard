# Engineering Standards

Shared engineering philosophy and development practices for Shipyard.

---

## Philosophy

We optimize for **speed with safety**. AI accelerates our coding, but humans own the design. We write less code that does more, and we test strategically around risk rather than chasing coverage metrics.

### Guiding Maxims

- **Code is tech debt by definition.** Less code that accomplishes the same thing is better. Fight complexity.
- **Tests should mean something.** A test that changes every sprint isn't protecting anything.
- **Patterns enable AI.** The more consistent our codebase, the better AI tools work with it.
- **Risk-based thinking.** Always ask: what's the blast radius if this goes wrong?

---

## Testing Philosophy

Tests exist to **mitigate risk**, not to satisfy coverage tools. We use a tiered coverage model based on code fan-in (how many places depend on a piece of code) rather than blanket percentage targets.

The goal is the **least amount of tests** needed to cover risk. AI loves to generate test spam. We want tests that mean something and rarely need to change.

### The 3+ Rule

If code is used in **3 or more places**, it requires tests on the interface. This signals the code has become a shared contract worth protecting—and statistically, this is where blast radius lives.

### Coverage Tiers

| Tier | Scope | Metric | Target |
|------|-------|--------|--------|
| Shared infrastructure | Static fan-in 3+ | Branch | 60% |
| Public interface | Routes / entry points | Integration test | Required |
| Safety net | All files | Function | 30% per-file |

We don't target line coverage (measures volume, not risk) or high global percentages (incentivizes testing low-risk code).

### Meta-Tests: Enforcement by Test Failure

We use **meta-tests** to enforce that public interfaces have integration tests. These are tests that verify other tests exist.

**Location:** `tests/integration-coverage.test.ts`

**How it works:**
- Scans configured directories for source files
- Verifies each source file has a corresponding test file
- Fails the test suite if any are missing

This runs as part of the normal test suite—no separate tooling needed. If you add a new route or tool without a test, CI fails.

**Configuration:** Edit `COVERAGE_REQUIREMENTS` array in the test file to add directories that require test coverage.

---

## Code Quality

### Exhaustive Type Checking

Discriminated unions must be handled exhaustively so missing cases fail at compile time:

```typescript
type Action =
  | { kind: 'create'; name: string }
  | { kind: 'update'; id: string; name: string }
  | { kind: 'delete'; id: string };

function assertNever(x: never): never {
  throw new Error(`Unhandled: ${JSON.stringify(x)}`);
}

function handleAction(a: Action): void {
  switch (a.kind) {
    case 'create': return;
    case 'update': return;
    case 'delete': return;
    default: return assertNever(a);
  }
}
```

Adding a new Action variant breaks the build until every switch handles it.

### Functional Programming

Default to pure functions with explicit inputs and outputs. Copy data instead of mutating it. Inject dependencies explicitly rather than reaching into global state.

### Strict TypeScript

All strict flags enabled. The compiler catches bugs so we don't have to.

### File Organization

For service files and shared modules, put the most important things first:

1. Exports and public types
2. Main public functions/classes
3. Private helpers and implementation details

Think of it like a newspaper: headline first, details below.

### File Naming

**Use kebab-case for all files.** This applies across the entire codebase—frontend, backend, docs, everything.

```
user-profile.tsx       # React component
user.service.ts        # Service
create-user.dto.ts     # DTO
auth.guard.ts          # Guard
user-profile.test.ts   # Test
use-auth.ts            # React hook
```

**Why kebab-case:**
- Cross-platform safe (no case-sensitivity bugs between Mac/Windows/Linux)
- Aligns with CSS naming conventions
- URL-friendly (important for file-based routing)
- Used by Angular, NestJS, Next.js App Router, SvelteKit

**Code naming remains standard:** PascalCase for components/classes, camelCase for functions/variables, SCREAMING_SNAKE_CASE for constants.

### Comments

**Comments should be rare.** If you find yourself writing a comment, you're probably doing something wrong.

The code itself should be clear enough to understand. If it isn't, refactor it—better names, smaller functions, clearer types. Comments are a code smell indicating the code isn't self-documenting.

**The only acceptable comments explain WHY, never WHAT:**

```typescript
// Bad - explains what (the code already shows this)
const total = items.reduce((sum, item) => sum + item.price, 0); // Sum prices

// Bad - still explaining what
// Calculate the total price of all items
const total = items.reduce((sum, item) => sum + item.price, 0);

// Good - self-documenting, no comment needed
const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

// Acceptable - explains a non-obvious decision
const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
// Using reduce instead of .map().sum() to avoid extra array allocation in hot path
```

**When comments ARE acceptable:**
- Non-obvious business constraints ("Max 50 to prevent Firestore quota issues")
- Workarounds for external bugs ("Retry needed - API returns 500 on first call")
- Performance decisions that aren't obvious from context
- Links to relevant documentation or issues

**Before writing a comment, ask:** Can I make this clearer through naming, extraction, or types instead? The answer is almost always yes.

---

## Code Review Guidelines

- Prioritize risk: changed tests, shared interfaces, and high fan-in modules get extra scrutiny
- Side effects audit: watch for hidden mutations and global state
- Exhaustiveness: verify discriminated unions have exhaustive switches
- 3+ Rule: if a utility is used in 3+ places, ensure interface tests exist
- Small PRs: favor focused PRs with clear intent

---

## Tech Stack

| Component | Choice | Version | Notes |
|-----------|--------|---------|-------|
| Package Manager | pnpm | 10.9.0 | Workspace support |
| Node Version | Node.js LTS | 22.14.0 | |
| TypeScript | TypeScript | 5.9.x | Strict mode |
| Build Tool | tsup | 8.5.1 | Workspace bundling |
| CSS Framework | Tailwind CSS | 4.x | Used by HeroUI v3 |
| Validation | zod | 3.23.x | Runtime validation |
| Linting | Biome | 2.x | Fast, no ESLint |
| Testing | Vitest | 4.x | Parallel execution |
| CRDT | Loro (via loro-extended) | latest | Collaborative editing |
| Block Editor | TipTap + loro-prosemirror | latest | Rich text with CRDT sync |
| Sync | loro-extended adapters | latest | WebSocket + P2P via Loro |
| UI Framework | React | 18.x | |
| UI Components | HeroUI v3 | beta | Tailwind v4 required |

---

*Last updated: 2026-02-11*
