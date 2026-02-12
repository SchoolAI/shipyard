# Deep Research -- Reference

Full subagent prompt templates, synthesis format, and customization guide.

## Subagent Prompt Templates

Each template has `[PLACEHOLDER]` fields. Replace them with specifics from Phase 1 findings. All subagents are **read-only**: they may only use Glob, Grep, and Read.

---

### Subagent 1: File Scope Mapper

```
You are mapping the exact files that will be modified or created to implement: [FEATURE_DESCRIPTION]

Affected apps/packages: [AFFECTED_AREAS]

Your mission: determine the complete list of files that need to change, and trace their dependency graph.

Steps:
1. Use Glob to find all files in these directories:
   [LIST SPECIFIC DIRECTORIES, e.g., "apps/server/src/tools/", "packages/loro-schema/src/"]

2. Read barrel exports (index.ts) in each affected directory to understand module boundaries

3. Read the specific files most likely to need modification:
   [LIST SPECIFIC FILES based on Phase 1 findings]

4. Use Grep to trace imports/exports:
   - Search for imports of types/functions that will change
   - Search for re-exports from barrel files
   - Search for usages of APIs that will be modified

5. Report with these exact sections:

FILES TO MODIFY:
- [file path] -- [what changes and why]

FILES TO CREATE:
- [file path] -- [purpose]

DEPENDENCY CHAIN:
- [file A] imports from [file B] which imports from [file C]

IMPORTS TO UPDATE:
- [file path] -- add/change import of [symbol] from [module]

TYPE DEFINITIONS:
- [file path] -- types that need new fields, new types needed
```

---

### Subagent 2: Pattern Matcher

```
You are finding existing implementations in the Shipyard codebase most similar to: [FEATURE_DESCRIPTION]

This feature involves: [BRIEF_TECHNICAL_DESCRIPTION]
Affected areas: [AFFECTED_AREAS]

Your mission: find 2-3 existing implementations that are the closest analogy to what we are building, and extract every reusable pattern.

Steps:
1. Search for analogous features:
   [SPECIFIC SEARCH STRATEGIES, e.g., "Grep for other MCP tool definitions in apps/server/src/tools/", "Find other React components that use useHandle in apps/web/src/"]

2. Read the most promising matches THOROUGHLY -- full files, not snippets. You need to understand:
   - File naming conventions
   - Export patterns (named vs default, barrel re-exports)
   - Error handling approach
   - Type patterns (generics, discriminated unions, Zod schemas)
   - Loro integration (how they use change(), shapes, handles)
   - Test file structure for those implementations

3. Check docs/whips/ for any documented patterns:
   - Use Glob to list docs/whips/**/*.md
   - Read titles/headers for relevance

4. Report with these exact sections:

SIMILAR IMPLEMENTATIONS:
1. [file:line] -- [what it does, why it is similar]
   Key patterns: [list specific patterns]
2. [file:line] -- [what it does, why it is similar]
   Key patterns: [list specific patterns]

PATTERNS TO FOLLOW:
- [Pattern name]: [description with file:line reference]

ANTI-PATTERNS TO AVOID:
- [What not to do]: [why, with file:line of bad example if found]

NAMING CONVENTIONS:
- Files: [pattern, e.g., "kebab-case, feature-name.ts"]
- Exports: [pattern, e.g., "named exports, no default"]
- Types: [pattern, e.g., "PascalCase, suffixed with Schema for Zod"]
```

---

### Subagent 3: Test Infrastructure Scout

```
You are analyzing the test infrastructure for: [FEATURE_DESCRIPTION]

Affected areas: [AFFECTED_AREAS]

Your mission: understand every aspect of the testing setup so we know exactly what test files to create, what patterns to use, and what coverage gates to satisfy.

Steps:
1. Find vitest config files:
   - Glob for **/vitest.config.* in affected apps/packages
   - Read each one to understand test setup (globals, environment, setup files)

2. Find existing test files in affected directories:
   - Glob for **/*.test.ts, **/*.spec.ts in [AFFECTED_DIRECTORIES]
   - Read 2-3 of the most relevant ones thoroughly

3. Find test utilities and mocks:
   - Grep for "mock" or "factory" or "fixture" in test directories
   - Look for shared test-utils files
   - Check for mock-repo patterns (Loro mock setup)

4. Check meta-test requirements:
   - Read tests/integration-coverage.test.ts
   - Determine if new files in the affected directories require companion test files

5. Evaluate the 3+ Rule:
   - Read scripts/analyze-fan-in.ts to understand fan-in calculation
   - For files being changed, estimate fan-in (how many other files import them)
   - Fan-in >= 3 means the file NEEDS interface tests

6. Report with these exact sections:

TEST FILES TO UPDATE:
- [test file path] -- [what to add/change]

TEST FILES TO CREATE:
- [test file path] -- [what it tests, which source file]

MOCK PATTERNS:
- [describe mock setup pattern with file:line reference]

TEST UTILITIES AVAILABLE:
- [utility name] from [file path] -- [what it provides]

COVERAGE REQUIREMENTS:
- Fan-in analysis: [which files have fan-in >= 3]
- Target: 30% per-file function coverage for high-fan-in files

META-TEST IMPACT:
- [Does the meta-test require new test files? Which directories are covered?]
```

---

### Subagent 4: Context Boundary Mapper

```
You are mapping the interfaces and boundaries touched by: [FEATURE_DESCRIPTION]

Affected areas: [AFFECTED_AREAS]

Your mission: identify every API surface, schema definition, cross-package dependency, and data flow boundary this feature touches.

Steps:
1. Find public API surfaces in affected areas:
   - MCP tool definitions: Grep for "tool(" or "defineTool" in apps/server/src/
   - React component props: Grep for "interface.*Props" or "type.*Props" in apps/web/src/
   - Loro shapes: Read packages/loro-schema/src/shapes.ts
   - HTTP routes: Grep for "router\." or "app\." in affected server files

2. Check schema impact:
   - Read packages/loro-schema/src/shapes.ts fully
   - Read packages/loro-schema/src/task-document.ts
   - Read packages/loro-schema/src/room-document.ts
   - Determine if new shapes, fields, or documents are needed

3. Map cross-package dependencies:
   - Read package.json files in affected apps/packages
   - Grep for cross-references between packages (e.g., "@shipyard/loro-schema" imports)
   - Identify which packages depend on packages being changed

4. Identify sync boundaries:
   - Server-to-browser data flow (WebSocket, Loro sync)
   - Browser-to-peer data flow (WebRTC)
   - Which data lives in CRDT vs ephemeral state vs server-only

5. Check for config/env requirements:
   - Grep for "process.env" or "import.meta.env" in affected areas
   - Check for .env.example files
   - Look for feature flags or configuration constants

6. Check recent changes:
   - Use Grep to find TODO or FIXME comments in affected files
   - Note any incomplete migrations or pending work

7. Report with these exact sections:

API SURFACE:
- [API type]: [description, file:line]

SCHEMA IMPACT:
- [New/modified shape]: [description]
- Breaking changes: [yes/no, details]

CROSS-PACKAGE DEPS:
- [package A] depends on [package B] via [what]

SYNC BOUNDARIES:
- Server: [what data the server manages]
- Browser: [what data the browser manages]
- Peer: [what flows over WebRTC]

CONFIG NEEDED:
- [env var or config]: [purpose]

RECENT CHANGES / PENDING WORK:
- [file:line] -- [TODO/FIXME/incomplete work noted]
```

---

## Synthesis Output Format

After all 4 subagents return, the parent agent synthesizes into this format:

```markdown
## Deep Research Complete

### Feature: [name]
### Affected Scope: [list apps and packages]

### Implementation Plan
1. [Step 1 -- specific file, specific change, why]
2. [Step 2 -- specific file, specific change, why]
3. ...
(Order steps by dependency: schemas first, then server, then UI)

### Key Patterns to Follow
- [Pattern name] -- [description, source file:line]
- [Pattern name] -- [description, source file:line]

### Files to Modify
| File | Change | Fan-in |
|------|--------|--------|
| `path/to/file.ts` | Add X method, update Y type | 5 |

### Files to Create
| File | Purpose | Pattern Source |
|------|---------|---------------|
| `path/to/new-file.ts` | Implements X | Based on `path/to/similar.ts` |

### Test Plan
| Test File | What It Tests | Priority |
|-----------|---------------|----------|
| `path/to/file.test.ts` | X function, Y integration | High (fan-in 5) |

### Schema Changes
- [Shape name]: [fields added/modified]
- Migration: [not needed / epoch reset / manual]

### Risks and Open Questions
- [Anything uncertain, missing info, or needing user input]
- [Potential breaking changes]
- [Areas where the existing code is unclear]
```

Then ask: **"Does this plan look right? Should I proceed?"**

---

## Customizing Subagent Prompts by Feature Type

### New MCP Tool
- File Scope Mapper: focus on `apps/server/src/tools/`, barrel exports, tool registration
- Pattern Matcher: search for existing tool definitions, especially ones with similar Loro operations
- Test Scout: check if `apps/server/src/tools/` is a meta-test covered directory
- Boundary Mapper: focus on tool input schema, Loro shape changes, server-only vs synced data

### New React UI Feature
- File Scope Mapper: focus on `apps/web/src/`, component directories, route files
- Pattern Matcher: search for similar components, especially Loro hook usage patterns
- Test Scout: check for component test patterns, React Testing Library setup
- Boundary Mapper: focus on component props, Loro selectors, ephemeral state boundaries

### New Loro Schema / Shape
- File Scope Mapper: focus on `packages/loro-schema/src/`, all consumers of affected shapes
- Pattern Matcher: search for similar shape definitions, document class patterns
- Test Scout: check for shape validation tests, document class tests
- Boundary Mapper: focus heavily on schema impact, cross-package consumers, sync implications

### Cross-Cutting Feature (touches server + web + schema)
- Use all subagents at full scope
- File Scope Mapper: trace the full data flow from schema to server to browser
- Pattern Matcher: find features that similarly span all three layers
- Test Scout: check test infrastructure in all affected areas
- Boundary Mapper: map every interface between the layers

### WHIP Implementation
- Read the WHIP document thoroughly in Phase 1
- Extract acceptance criteria from the WHIP
- Tell each subagent about the WHIP's specific requirements
- Cross-reference the WHIP's proposed approach against actual codebase state

---

## Shipyard File Path Reference

Quick reference for subagent prompt customization.

### Schema Layer
- `packages/loro-schema/src/shapes.ts` -- all CRDT shape definitions
- `packages/loro-schema/src/task-document.ts` -- TaskDocument wrapper class
- `packages/loro-schema/src/room-document.ts` -- RoomDocument wrapper class
- `packages/loro-schema/src/index.ts` -- barrel exports

### Server Layer
- `apps/server/src/tools/` -- MCP tool definitions
- `apps/server/src/loro/` -- Server-side Loro repo, sync, adapters
- `apps/server/src/index.ts` -- Server entry point

### Web Layer
- `apps/web/src/components/` -- React components
- `apps/web/src/loro/` -- Loro hooks, selectors, context
- `apps/web/src/routes/` -- Page routes

### Infrastructure
- `scripts/analyze-fan-in.ts` -- Fan-in coverage analysis
- `tests/integration-coverage.test.ts` -- Meta-test
- `biome.json` -- Linter config (noExplicitAny, noConsole)
- `eslint.config.mjs` -- Comment style + type assertion rules
- `tsconfig.base.json` -- Strict TS (noUncheckedIndexedAccess, strict)
- `scripts/validate-file-allowlist.sh` -- Blocks unapproved .md/.txt files

### Config Files per App/Package
- `apps/*/package.json` -- Dependencies and scripts
- `apps/*/tsconfig.json` -- TypeScript config (extends base)
- `apps/*/vitest.config.*` -- Test config
- `packages/*/package.json` -- Dependencies and scripts

---

## What Good Research Output Looks Like

### Good Subagent Output
- Specific file paths with line numbers where relevant
- Full understanding of the file, not just a grep match
- Clear distinction between "must change" and "might need to change"
- Patterns described concretely enough to copy

### Bad Subagent Output
- Vague references ("somewhere in the server code")
- Listing files without explaining what changes are needed
- Missing dependency chains (changing A without noting B imports from A)
- Skipping test infrastructure analysis

### Good Synthesis
- Implementation steps ordered by dependency
- Every file accounted for (modify + create)
- Test plan tied to fan-in analysis
- Risks called out honestly, not hidden
- Concrete enough that implementation could start immediately after approval

### Bad Synthesis
- Steps too vague ("implement the feature", "add tests")
- Missing files discovered later during implementation
- No test plan or a hand-wavy one
- No risks section (there are always risks)
