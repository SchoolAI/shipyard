---
name: shipyard-deep-research
description: "Deep context research before implementing a feature. Use when starting a new feature, implementing a WHIP, beginning a multi-file change, or when the user says 'research first', 'saturate context', 'deep dive', or 'understand before building'. Gathers architecture docs, relevant files, similar patterns, and test infrastructure in parallel before writing any code."
---

# Deep Research

A **workflow/process skill** that prevents premature implementation. Before writing a single line of code, saturate context by reading architecture docs, mapping affected files, finding similar patterns, and understanding test infrastructure. The result is a structured implementation brief that the user approves before coding begins.

## When to Use

- Starting a new feature or WHIP implementation
- Multi-file changes that touch 3+ files across apps/packages
- User says "research first", "saturate context", "deep dive", "understand before building"
- You are unsure which files need to change or what patterns to follow

**Skip for:** Single-file changes, typo fixes, config tweaks, anything under 3 files in one directory.

## The 3-Phase Process

```
Phase 1: Sequential Baseline (parent reads docs)
    |
    v
Phase 2: Parallel Deep Dives (4 subagents, read-only)
    |
    v
Phase 3: Synthesis (structured brief, user approval)
```

### Phase 1: Sequential Baseline (Parent Agent)

Read these docs sequentially to build vocabulary for good subagent prompts:

1. **Task description** -- identify affected apps, packages, domains
2. **`docs/architecture.md`** -- current architecture and data model
3. **`docs/engineering-standards.md`** -- code quality, testing, patterns
4. **`AGENTS.md`** -- tech stack quick reference
5. **Relevant WHIPs** -- scan `docs/whips/` titles, read any related ones
6. **Relevant ADRs** -- scan `docs/decisions/` titles, read any related ones
7. **Formulate research questions** -- write specific prompts for each subagent based on what you learned

After reading, you should know: which apps/packages are affected, what the feature touches, and what questions to send to subagents.

### Phase 2: Parallel Deep Dives (4 Subagents)

Spawn all 4 simultaneously using the Task tool. **All subagents are read-only** -- they use Glob, Grep, and Read only. No Bash, no Edit, no Write.

Customize each subagent's prompt based on Phase 1 findings. The templates in [reference.md](./reference.md) are starting points -- adapt search directories and patterns to the specific feature.

| Subagent | Mission | Key Output |
|----------|---------|------------|
| **File Scope Mapper** | Map exactly which files will be modified/created | Files to modify, files to create, dependency chain, imports to update |
| **Pattern Matcher** | Find 2-3 existing implementations most similar to what we're building | Similar implementations with file:line, patterns to follow, anti-patterns |
| **Test Infrastructure Scout** | Understand test setup for affected area | Test files to update/create, mock patterns, coverage requirements |
| **Context Boundary Mapper** | Map interfaces and boundaries this feature touches | API surface, schema impact, cross-package deps, sync boundaries |

### Phase 3: Synthesis (Parent Agent)

After all 4 subagents return, synthesize their findings into a structured implementation brief. Use the format in [reference.md](./reference.md). Then ask the user:

> "Does this plan look right? Should I proceed?"

**Do not write code until the user approves.**

## Rules

1. **Never write code during Phases 1-3.** Research only.
2. **All 4 subagents run in parallel.** Use multiple Task calls in one message.
3. **Subagents are read-only.** Glob, Grep, Read only. No Bash, Edit, Write.
4. **Phase 1 is sequential.** Parent needs baseline context to write good subagent prompts.
5. **Subagent prompts are customized per task.** Templates are starting points -- adapt search areas based on Phase 1 findings.
6. **Phase 3 synthesis is mandatory.** Never skip to coding.
7. **User approval required.** Present the brief and wait for confirmation before implementation.

## Shipyard Project Structure

```
apps/
  server/          # MCP server (WebSocket + tools)
  web/             # React app (TipTap editor + HeroUI)
  hook/            # Claude Code hooks
  session-server/  # Cloudflare Workers signaling
  mcp-proxy/       # MCP proxy
packages/
  loro-schema/     # Loro shapes, typed docs, helpers
  session/         # Session management
docs/
  architecture.md
  engineering-standards.md
  decisions/       # ADRs
  whips/           # Design docs
scripts/           # Build/lint/coverage scripts
tests/             # Root-level meta-tests
```

Key files subagents should know about:
- `packages/loro-schema/src/shapes.ts` -- CRDT schema definitions
- `packages/loro-schema/src/task-document.ts` -- Task document class
- `packages/loro-schema/src/room-document.ts` -- Room document class
- `scripts/analyze-fan-in.ts` -- Fan-in coverage analysis
- `tests/integration-coverage.test.ts` -- Meta-test requiring test files
- `biome.json` -- Linter config
- `eslint.config.mjs` -- Comment + type assertion rules
- `tsconfig.base.json` -- Strict TypeScript config

## Deep Reference

- **[reference.md](./reference.md)** -- Full subagent prompt templates, synthesis format, customization guide
