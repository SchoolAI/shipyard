Our team's shared engineering philosophy, development patterns, and collaborative practices. These principles guide how we build, test, and ship PowerUps.

---

# Philosophy

We optimize for **speed with safety**. AI accelerates our coding, but humans own the design. We write less code that does more, and we test strategically around risk rather than chasing coverage metrics.

# Guiding Maxims

**Code is tech debt by definition.** Less code that accomplishes the same thing is better. Fight complexity.

**Tests should mean something.** A test that changes every sprint isn't protecting anything.

**Patterns enable AI.** The more consistent our codebase, the better AI tools work with it. Divergent styles confuse both humans and machines.

**Shared context beats individual speed.** Pairing on foundational work pays dividends when anyone can work on any part of the system.

**Risk-based thinking.** Whether it's testing, code review, or architectural decisions, always ask: what's the blast radius if this goes wrong?

---

# Testing Philosophy

Tests exist to **mitigate risk**, not to satisfy coverage tools. We use a tiered coverage model based on code fan-in (how many places depend on a piece of code) rather than blanket percentage targets.

The goal is the **least amount of tests** needed to cover risk. AI loves to generate test spam. We want tests that mean something and rarely need to change.

## Why Fan-In Based Coverage

Software follows a Zipf/power law distribution—a small percentage of code is heavily reused while most code has limited fan-out. Targeting coverage on shared code maximizes risk reduction per test written.

## The 3+ Rule

If code is used in **3 or more places**, it requires tests on the interface. This signals the code has become a shared contract worth protecting—and statistically, this is where blast radius lives.

## Coverage Tiers

| Tier | Scope | Metric | Target |
| --- | --- | --- | --- |
| Shared infrastructure | Static fan-in 3+ | Branch | 60% |
| Public interface | Routes / entry points | Integration test | Required |
| Safety net | All files | Function | 30% per-file |

We don't target line coverage (measures volume, not risk) or high global percentages (incentivizes testing low-risk code). See the sub-page below for measurement details and full rationale.

[Fan-In & Coverage Model](https://www.notion.so/Fan-In-Coverage-Model-2c198e7502bb8122b2eeec4c6cb38f6c?pvs=21)

---

# Code Quality Principles

## Exhaustive Type Checking

Discriminated unions must be handled exhaustively so missing cases fail at type‑check time. Keep a defensive throw, but types should make it unreachable.

```tsx
// Discriminant: kind
export type Action =
	| { kind: 'create'; name: string }
	| { kind: 'update'; id: string; name: string }
	| { kind: 'delete'; id: string };

// One compact example with both patterns:
export function describe(a: Action): string {
	switch (a.kind) {
		case 'create': return `create ${
```

```tsx
// Case 1: inline never
export function describe(a: Action): string {
	switch (a.kind) {
		case 'create': return `create ${[a.name](http://a.name)}`;
		case 'update': return `update ${[a.id](http://a.id)} -> ${[a.name](http://a.name)}`;
		case 'delete': return `delete ${[a.id](http://a.id)}`;
		default: {
			const _exhaustive: never = a; // compile‑time failure if unhandled
			throw new Error(`Unhandled Action: ${JSON.stringify(a)}`);
		}
	}
}

// Could be a helper: `assertNever` enforces exhaustiveness
function assertNever(x: never): never { // could be a helper
	throw new Error(`Unhandled: ${JSON.stringify(x)}`);
}
export function run(a: Action): void {
	switch (a.kind) {
		case 'create': return;
		case 'update': return;
		case 'delete': return;
		default: return assertNever(a as never); // compile‑time failure if missing
}
	}
```

```tsx
// Case 2: assertNever helper
function assertNever(x: never): never {
	throw new Error(`Unhandled: ${JSON.stringify(x)}`);
}

export function run(a: Action): void {
	switch (a.kind) {
		case 'create': return;
		case 'update': return;
		case 'delete': return;
		default: return assertNever(a as never); // compile‑time failure if missing
	}
}
```

Key point: adding a new Action variant breaks the build until every switch handles it.

## Functional Programming (Minimize Side Effects)

We lean functional. Pure functions with explicit inputs and outputs are easier to test, debug, and reason about. Copy data instead of mutating it. Extract transforms into standalone functions. Inject dependencies explicitly rather than reaching into global state.

This doesn't mean we're purists, but we default to functional patterns unless there's a compelling reason not to.

## Strict TypeScript Configuration

We run with all the strict flags enabled. The compiler catches bugs so we don't have to.

## File Organization: Public API at the Top

For service files, utilities, and shared modules, put the most important things first.

**Recommended order:**

1. Exports and public types
2. Main public functions/classes
3. Private helpers and implementation details

**Why this matters:** When you open a file, you immediately see what it *does* and what it *exposes*—the contract. Implementation details can live below. This is especially valuable when multiple services import from the file, or when AI tools are reading your code (they see the interface first too).

**Where this applies:** Backend services, shared utilities, library code that others import from. Less critical for React components where the component naturally ends up at the bottom after hooks and helpers.

Think of it like a newspaper: headline first, details below.

## File Naming

**Frontend: camelCase** (`userProfile.tsx`, `apiClient.ts`)

**Backend: kebab-case** (`user-service.py`, `api-routes.py`)

**Why this matters:** Consistency makes the codebase predictable for both humans and AI. When AI tools generate code, they pattern-match on existing style. Mixed conventions confuse the model and create review friction.

**Component naming:** React components should be PascalCase for the component itself, but the file is still camelCase (`userProfile.tsx` exports `UserProfile`).

**Index files:** Use `index.ts` to re-export from a module, but avoid putting substantial logic in index files. They should be thin routing layers.

## Comments

**Comments should explain *why*, not *what***. Code that needs comments to explain what it does should be refactored to be clearer instead.

```tsx
// Bad: Noise
const total = items.reduce((sum, item) => sum + item.price, 0); // Sum the prices

// Good: Self-documenting
const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

// Better when needed: Explains reasoning
const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
// Using reduce instead of .map().sum() to avoid extra array allocation
```

**When to comment:**

- Non-obvious business constraints ("Max 50 to prevent Firestore quota issues")
- Workarounds for external bugs ("Retry needed - API returns 500 on first call")
- Performance decisions that aren't obvious ("Linear search faster here - dataset < 10 items")
- Complex algorithms where the approach isn't self-evident

**When not to comment:**

- What a variable stores (fix the variable name)
- What a function does (fix the function name or extract it)
- Obvious code flow or language features

**Before commenting, ask:** Can I make this clearer through naming, extraction, or types instead?

---

## Code Review Guidelines

- Prioritize risk: changed tests, shared interfaces, and high fan‑in modules get extra scrutiny.
- Stability check: if tests churn often, the interface may not be ready; consider stabilizing before adding tests.
- Side effects audit: watch for hidden mutations and global state touches.
- Exhaustiveness: verify discriminated unions have exhaustive switches with compile‑time failures.
- 3+ Rule: if a utility is used in 3 or more places, ensure interface tests exist.
- Small PRs: favor focused PRs with clear intent and tight diffs.
- Review ergonomics: top‑load files with public API for faster comprehension.

---

# Pair Programming Standards

For new, high-risk, or foundational code, we work together. This builds shared context, catches issues early, and ensures everyone understands the patterns.

## Two People: Driver + Navigator

**Driver:** Hands on keyboard. Uses AI for mechanical typing, but owns the design decisions. The driver is not just transcribing AI output. They're steering, reviewing, and curating what gets committed.

**Navigator:** Provides high-level direction. Thinks about architecture, edge cases, and the bigger picture. Not focused on syntax or typing. Asks questions like "Should this be extracted?" or "What happens when this fails?"

## Three People: Driver + Navigator + Scout

Same two core roles, plus a third who gathers context and de‑risks unknowns.

- **Driver:** Same as above. Implements and reviews. Additionally, pulls needed context from the Scout rather than breaking flow to search.
- **Navigator:** Same as above. Provides direction and edge‑case thinking. Additionally, orchestrates with the Scout to surface docs, code references, URLs, and quick spikes for the group.
- **Scout:** Researches and de‑risks unknowns, gathers relevant context, finds repo/code links and external docs, and keeps the Driver and Navigator fed so they stay in flow.

## When to Pair

Setting up new services or patterns. Touching code that affects multiple systems. Onboarding someone to unfamiliar code. Debugging gnarly production issues.

## When Not to Pair

Well-understood, isolated work. Bug fixes in familiar code. Following established patterns that are already documented. Low risk work

---

# Backend Server Tech Stack

This section describes the backend server stack only. Frontend and other stacks will be listed separately.

## Core Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| Package Manager | pnpm | 10.9.0 | Shared workspace, catalog support |
| Node Version | Node.js LTS | 22.14.0 | Matches repo standard |
| TypeScript | TypeScript | 5.5.4 | Catalog (shared with repo) |
| Build Tool | tsdown | 0.3.1 | 49% faster than tsup |
| Server Framework | Express | 4.21.2 | Battle-tested, dd-trace auto-instruments |
| Logging | pino + @sai/logger | 9.6.0 | High-performance structured logs |
| APM/Tracing | dd-trace (Datadog) | 5.67.0 | Full observability in production |
| Validation | zod | 3.24.1 | Type-safe runtime validation |
| Linting | Biome | 1.9.4 | 20-50x faster than ESLint |
| Task Runner | Turborepo | 1.13.4 | Caching, parallel execution |

## Testing Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| Integration Tests | Vitest | 3.0.6 | Proper isolation, parallel execution |
| Test Database | Firestore (Emulator) | - | Isolated database instance per test file to avoid flaky tests |
| Coverage | v8 (Vitest) | Built-in | Faster than istanbul |

> Principle: each test file gets its own Firestore emulator instance and data namespace to ensure isolation and prevent cross-test flakiness.
> 

## Service Communication

We use **tRPC** for internal service communication. It gives us end-to-end type safety between frontend and backend, organizes routes cleanly with routers, and supports bi-directional communication when needed.

---

# Peer-Plan Tech Stack

This project uses a specialized stack for P2P collaborative editing. It follows the core standards above (pnpm, TypeScript, Biome, Vitest) with additions for CRDT sync.

## Core Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| Package Manager | pnpm | 10.9.0 | Shared workspace (aligns with repo standard) |
| Node Version | Node.js LTS | 22.14.0 | Matches repo standard |
| TypeScript | TypeScript | 5.6.0 | Strict mode enabled |
| Build Tool | tsdown | 0.3.1 | 49% faster than tsup (aligns with repo standard) |
| Validation | zod | 3.23.8 | Type-safe runtime validation |
| Linting | Biome | 1.9.4 | 20-50x faster than ESLint |
| Testing | Vitest | 2.1.0 | Fast, parallel execution |

## P2P Collaboration Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| CRDT | Yjs | 13.6.0 | Mature, battle-tested for collaborative editing |
| Block Editor | BlockNote | 0.18.0 | Notion-like editor with built-in CRDT support |
| MCP ↔ Browser Sync | y-websocket | 2.0.4 | WebSocket provider for Yjs |
| Browser ↔ Browser Sync | y-webrtc | 10.3.0 | P2P sync between remote reviewers |
| Browser Persistence | y-indexeddb | 9.0.12 | Survives page refresh |
| Comments | BlockNote native | Built-in | YjsThreadStore for annotations |
| URL Encoding | lz-string | 1.5.0 | URL-safe compression (40-60% reduction) |
| MCP Server | @modelcontextprotocol/sdk | Latest | Agent integration |

## UI Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| Framework | React | 18.3.0 | BlockNote is React-native |
| UI Components | Mantine | 7.x | BlockNote uses Mantine components |
| Build Tool | Vite | 6.0.0 | Fast dev server, static build for GitHub Pages |

See [decisions/0001-use-yjs-not-loro.md](./decisions/0001-use-yjs-not-loro.md) for why we chose Yjs + BlockNote.

# AI-Assisted Development

Our goal is for AI to handle most implementation once patterns are established. The bottleneck shifts from coding to design articulation.

## Engineers Own Design

Architecture decisions, interface design, system boundaries, what to test, risk assessment, pattern selection. These require judgment and context that comes from understanding the product and users. We capture these decisions through design docs, pairing transcripts, and structured notes.

## AI Owns Implementation

Once design is articulated, code should materialize. If our patterns are consistent and our intent is clear, implementation becomes deterministic. The better we document our design sessions, the less manual coding required.

## The Ideal Flow

1. Engineers discuss and decide (pairing, design review, whiteboarding)
2. Decisions get captured (transcripts, notes, specs)
3. AI generates implementation from captured context
4. Engineers review and refine

## What Makes This Work

**Pattern consistency.** The more predictable our codebase, the better AI can extrapolate. Divergent styles break the model.

**Rich context capture.** Transcripts from design sessions, clear specs, examples of similar work. AI needs the "why" not just the "what."

**Clear interfaces.** Well-defined boundaries mean AI can implement within a box without needing to understand everything.