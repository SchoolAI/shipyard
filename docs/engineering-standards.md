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

# Shipyard Tech Stack

This project uses a specialized stack for P2P collaborative editing. It follows the core standards above (pnpm, TypeScript, Biome, Vitest) with additions for CRDT sync.

## Core Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| Package Manager | pnpm | 10.9.0 | Shared workspace (aligns with repo standard) |
| Node Version | Node.js LTS | 22.14.0 | Matches repo standard |
| TypeScript | TypeScript | 5.6.0 | Strict mode enabled |
| Build Tool | tsup | 8.5.1 | Workspace bundling works (tsdown broken for pnpm monorepos) |
| Validation | zod | 3.23.8 | Type-safe runtime validation |
| Linting | Biome | 1.9.4 | 20-50x faster than ESLint |
| Testing | Vitest | 2.1.0 | Fast, parallel execution |

**Note:** Previously used tsdown (49% faster), but switched to tsup due to [workspace bundling issues](https://github.com/rolldown/tsdown/issues/544). tsup reliably bundles workspace packages for npm distribution.

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
| Logging | pino + pino-pretty | 10.1.0 | Structured logs, stderr-safe for MCP |

## UI Stack

| Component | Choice | Version | Why |
| --- | --- | --- | --- |
| Framework | React | 18.3.0 | BlockNote is React-native |
| UI Components | Mantine | 7.x | BlockNote uses Mantine components |
| Build Tool | Vite | 6.0.0 | Fast dev server, static build for GitHub Pages |

See [decisions/0001-use-yjs-not-loro.md](./decisions/0001-use-yjs-not-loro.md) for why we chose Yjs + BlockNote.

## Environment Variables

All apps follow a modular environment variable pattern with Zod validation:

```typescript
// apps/*/src/config/env/*.ts
import { z } from 'zod';
import { loadEnv } from '../config.js';

const schema = z.object({
  MY_VAR: z.string().default('default-value'),
  MY_PORT: z.coerce.number().default(3000),
});

export const myConfig = loadEnv(schema);
export type MyConfig = z.infer<typeof schema>;
```

**Pattern requirements:**
1. One file per domain (server, registry, github, web, etc.)
2. All env vars validated with Zod schemas
3. No direct `process.env` access outside config/ directory
4. Clear default values in schemas
5. Type inference via `z.infer`

**Reference:** Power-up server `/apps/server/src/config/` for full example.

## Logging Strategy

### MCP Server Logging (pino)

Use **pino** for all server-side logging:

```typescript
import pino from 'pino';

// Environment-aware configuration
const transport = process.env.NODE_ENV === 'development'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport ? pino.transport(transport) : undefined
);
```

**Critical for MCP:** Pino logs to **stderr by default**. This is essential because MCP uses stdout for JSON-RPC protocol communication. Any stdout logs will corrupt the protocol.

**Levels:** debug, info, warn, error
**Development:** Use pino-pretty for readable logs
**Production:** Raw JSON to stderr for log aggregators

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

---

# Agent-Driven Feature Development

For complex features, we use an **orbit pattern**—a repeatable cycle that maximizes parallel work while ensuring quality. The key insight: launch multiple async agents to work simultaneously, then review everything together.

## The Orbit

```
┌─────────────────────────────────────────────────────────────┐
│  1. PLAN                                                    │
│     - Break feature into independent phases                 │
│     - Identify files to modify per phase (scope isolation)  │
│     - Write detailed instructions with success criteria     │
│     - Document what agents can work on in parallel          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. IMPLEMENT (Parallel Async Agents)                       │
│     - Launch ALL phase agents in one message block          │
│     - Each agent gets: full context, standards, file paths  │
│     - Agents work autonomously while you do other work      │
│     - Use Opus for complex, Sonnet for straightforward      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. REVIEW (Parallel: Human + Agents)                       │
│     Human: Scan diffs for architectural issues              │
│     Agent 1: Adversarial (try to DISPROVE correctness)      │
│     Agent 2: Standards compliance check                     │
│     → Both agents run in parallel                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. VERIFY                                                  │
│     - Address critical findings from review                 │
│     - Run checks: types, lint, tests                        │
│     - For deployed code: check GitHub Actions, env vars     │
│     - Fix issues, re-check until clean                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. COMMIT                                                  │
│     - Stage feature-specific files only                     │
│     - Use --no-verify if parallel work is in flight         │
│     - Commit message describes what changed and why         │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [Repeat for next feature]
```

## Critical: Launch Agents in Parallel

When you have multiple independent phases, launch ALL implementation agents in a single message:

```typescript
// Example from Registry Hub Architecture (Issue #62):
Task("Phase 1: WebSocket integration", ..., run_in_background: true)
Task("Phase 2: MCP client mode", ..., run_in_background: true)
Task("Phase 3: Browser simplification", ..., run_in_background: true)
```

**Why:** Agents work simultaneously. Total time = slowest agent, not sum of all agents. For 3 phases taking 30min each, you get done in 30min instead of 90min.

## Agent Prompt Template

Every implementation agent should receive:

```markdown
## Engineering Standards (CRITICAL - FOLLOW THESE)
- Use TypeScript strict mode
- Use Biome for linting (not ESLint)
- Use exhaustive switch statements with `assertNever` pattern
- Functional programming: minimize side effects
- No backwards compatibility needed - break things freely
- Comments explain "why" not "what"
- File organization: public API at top

## Your Task
[Specific implementation instructions]

## Files to Modify
- path/to/file.ts - What to change

## Files to Reference
- path/to/pattern.ts - Example to follow

## Success Criteria
- [ ] Specific, testable outcomes
```

**Key insight:** Agents work better with explicit standards. Don't assume they know your conventions.

## Why Each Step Matters

**Plan first:** Scope isolation prevents agents from touching unrelated code. Clear boundaries reduce merge conflicts when work happens in parallel. File paths guide agents to the right places.

**Async + parallel:** Human time is the bottleneck. Launch all agents at once and do other work. Rich context upfront means fewer clarification loops. Agents that don't depend on each other should run simultaneously.

**Adversarial review:** Find what's **wrong**, not confirm it "works." Launch two agents in parallel: one for bugs (Opus), one for standards (Sonnet).

**Human review matters:** Agents miss architectural issues humans spot instantly. Does this fit the design? Is there a simpler way?

## Adversarial Review Mindset

The goal is to **disprove correctness**. A review that says "looks good" provides zero value.

**Review agent prompt template:**
```markdown
CRITICAL: Try to DISPROVE this is correct. Read FULL files for context.
Look for: race conditions, data loss, memory leaks, type safety holes,
missing error handling, edge cases. Report exact file:line references.
If you find nothing wrong, state explicitly what you checked.
```

**Agent checklist:**
- Race conditions (concurrent processes/browsers)
- Data loss (crash during write, network partition)
- Memory leaks (unclosed connections, unbounded maps)
- Type safety (unsafe casts, missing exhaustive checks)
- Error handling (what throws? caught? graceful failure?)

**Human checklist:**
- Logic errors (does code do what it claims?)
- Architectural fit (matches patterns?)
- Simplicity (simpler way missed?)
- Cascading breaks (did removing X break Y?)

## Sequential vs Parallel Workflows

**Parallel (features):** Large features with independent phases. Launch all agents at once.

**Sequential (bug fixes):** Many small fixes from an audit. Process one-by-one with the orbit: implement → review → commit → next. Use a tracking document (e.g., `/tmp/project-audit-fixes.md`) to track status across fixes.

## Example: Registry Hub Architecture

This feature had 3 phases (WebSocket integration, MCP client, Browser simplification):

1. **Plan:** Wrote detailed plan with file paths and success criteria per phase
2. **Implement:** Launched 3 Opus agents in parallel (one message, 3 Task calls)
3. **Review:** Launched adversarial review agent (Opus) to find race conditions
4. **Verify:** Ran type checks, fixed findings, confirmed clean build
5. **Commit:** Stage all registry hub files together

**Total time:** ~30 minutes for 3 phases (vs 90 minutes sequential)

## Model Selection for Agents

| Task | Model | Why |
|------|-------|-----|
| Implementation | Opus | Complex, multi-file, needs deep reasoning |
| Adversarial review | Opus | Finding bugs requires careful analysis |
| Standards review | Sonnet | Pattern matching against known rules |
| Simple fixes | Haiku | Fast, low complexity tasks |

Don't over-engineer model selection—when in doubt, use Opus for anything non-trivial.