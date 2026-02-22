---
name: shipyard-qa
description: "Post-implementation review and fix. Spawns architectural steward + adversarial-reviewer + engineering-standards + domain expert in parallel, auto-fixes unanimous findings, presents disagreements to user."
argument-hint: [description of what was implemented]
---

# Post-Implementation QA

A **workflow skill** that reviews recent implementation work, auto-fixes unanimous findings, and only asks the user about disagreements.

## When to Use

- After implementing a feature, refactor, or significant change
- User says `/qa`, "review this", "check my work", or "run QA"
- Before committing work that touches 3+ files

## The 5-Phase Process

```
Phase 1: GATHER context
    |
Phase 2: REVIEW (up to 4 parallel subagents)
    |
Phase 3: CONSENSUS analysis
    |
Phase 4: FIX unanimous + ask about contested
    |
Phase 5: VERIFY gates pass
```

### Phase 1: GATHER

Collect the implementation context before spawning reviewers.

1. **Get changed files:**
   ```bash
   git diff --name-only HEAD
   git diff --name-only --cached
   git diff --name-only HEAD~1..HEAD  # if already committed
   ```
   Combine all three to capture staged, unstaged, and recently committed changes.

2. **Read the changed files** to understand what was implemented.

3. **Determine domain** for the 3rd reviewer. Evaluate rows top-to-bottom; first match wins:
   | Priority | Changed files contain | Select |
   |----------|----------------------|--------|
   | 1 | `.claude/skills/**` or docs only | Skip domain expert (use Reviewers 0-2 only) |
   | 2 | Both `apps/web/**` and any backend path | `shipyard-fullstack-expert` |
   | 3 | `apps/web/**` only | `shipyard-frontend-expert` |
   | 4 | `apps/session-server/**`, `apps/daemon/**`, or `apps/og-proxy-worker/**` | `shipyard-backend-expert` |
   | 5 | `packages/**` only | `shipyard-backend-expert` (add design checks to prompt if `packages/loro-schema/**` is touched, since it's shared with frontend) |
   | 6 | No match above | Skip domain expert (use Reviewers 0-2 only) |

4. **Build the file list** as absolute paths for subagent prompts.

### Phase 2: REVIEW

Spawn reviewers in parallel using the Task tool. **All subagents use `run_in_background: true`** per AGENTS.md bug workaround.

After spawning all reviewers, **wait for each to complete** — the system sends a notification when each background task finishes. Then use `Read` on the `output_file` path returned by each Task call to retrieve the full reviewer output. Do NOT read output files before completion notifications arrive, or you may get partial results.

**Reviewer 0: Architectural Steward** (elevated weight — see Phase 3)

```
subagent_type: "Plan"
```

This reviewer operates as a staff engineer with deep codebase context. It gathers broad architectural context BEFORE forming opinions, ensuring changes align with established patterns and long-term direction. Uses the `Plan` agent type (a built-in Claude Code type, not a skill-backed type like the other reviewers) because it has read-only access to Glob, Grep, Read, and Bash — ideal for deep exploration without write capability. No dedicated architectural-steward skill exists; the inline prompt provides all necessary instructions.

Prompt template — customize the file list and context per task:

```
You are a Staff Engineer reviewing this change for architectural alignment, pattern consistency, and long-term codebase health. Your job is to protect the Shipyard codebase from drift, duplication, and one-off patterns.

## What Was Implemented
[DESCRIPTION from /qa argument or gathered context]

## Changed Files (read ALL of these)
[ABSOLUTE_FILE_PATHS, one per line]

## Deep Context Gathering (do ALL of this FIRST)
Before forming any opinions, saturate your context:
1. Read docs/architecture.md for the current architecture and data model
2. Read docs/engineering-standards.md for established patterns and philosophy
3. Scan docs/decisions/ directory and read any ADRs relevant to this area
4. Scan docs/whips/ directory and read any design docs relevant to this area
5. For each changed file, explore the surrounding directory to understand existing patterns
6. Search for similar implementations elsewhere in the codebase (grep for function names, type names, patterns used in the changes)
7. Check if the codebase already has utilities or abstractions that overlap with what was added
8. Understand the module boundaries and dependency direction between apps/ and packages/

## Review Lens (10,000-foot view)
Evaluate each change against these criteria:
1. **Architectural alignment** — Does this respect established module boundaries and data flow direction?
2. **Pattern consistency** — Does it follow existing patterns, or introduce a new way of doing something already done elsewhere?
3. **Duplication** — Is this reimplementing something that already exists? Could it reuse an existing abstraction?
4. **Direction** — Is this moving the codebase toward its stated architectural goals, or drifting?
5. **Precedent** — Will this change create a pattern others will copy? Is that a good pattern to spread?
6. **Coupling** — Does this introduce inappropriate coupling between modules that should be independent?
7. **Abstraction level** — Is the abstraction at the right level? Too early? Too late? Wrong boundary?

## Instructions
- Spend significant time gathering context BEFORE forming opinions
- Reference architecture docs and existing patterns to support every finding
- When flagging duplication or drift, point to the existing implementation that should be used instead
- Reference specific file:line for every finding
- Rate confidence (high/medium/low) per finding
- Every finding MUST cite the architectural principle or existing pattern it relates to

## Output Format (IMPORTANT: use EXACTLY this format, override any default format you may have)
### Context Gathered
Brief summary of architecture docs, existing patterns, and related code reviewed (list key files read).

### Findings
| # | Severity | File:Line | Issue | Principle/Pattern Violated | Suggested Fix | Confidence |
|---|----------|-----------|-------|---------------------------|---------------|------------|

### Summary
- Critical: N, High: N, Medium: N
- Architectural alignment: aligned / drifting / misaligned
- Recommendation: approve / needs-fixes
```

**Reviewer 1: Adversarial Reviewer**

```
subagent_type: "shipyard-adversarial-reviewer"
```

Prompt template — customize the file list and context per task:

```
You are reviewing a post-implementation change in Shipyard.

## What Was Implemented
[DESCRIPTION from /qa argument or gathered context]

## Changed Files (read ALL of these)
[ABSOLUTE_FILE_PATHS, one per line]

## Instructions
1. Read every changed file thoroughly
2. Read docs/engineering-standards.md for project standards
3. Try to DISPROVE correctness — find bugs, not confirmations
4. Focus on: race conditions, data loss, error handling, type holes, edge cases, missing cleanup
5. Reference specific file:line for every finding
6. Rate confidence (high/medium/low) per finding

## Output Format (IMPORTANT: use EXACTLY this format, override any default format you may have)
### Findings
| # | Severity | File:Line | Issue | Suggested Fix | Confidence |
|---|----------|-----------|-------|---------------|------------|

### Summary
- Critical: N, High: N, Medium: N
- Recommendation: approve / needs-fixes
```

**Reviewer 2: Engineering Standards**

```
subagent_type: "shipyard-engineering-standards"
```

Prompt template:

```
You are reviewing code against Shipyard's engineering quality gates.

## Changed Files (read ALL of these)
[ABSOLUTE_FILE_PATHS, one per line]

## Instructions
1. Read every changed file thoroughly
2. Read docs/engineering-standards.md for the full standard
3. Check every item on the review checklist (see reference.md in engineering-standards skill)
4. Run these checks mentally — DO NOT run bash commands:
   - Type assertions (no `as X` except `as const` / `as never`)
   - Comment style (no `//` except directives)
   - Exhaustive switches (assertNever on discriminated unions)
   - File naming (kebab-case)
   - File organization (exports first)
   - Fan-in consideration (is this used 3+ places? needs tests?)
5. Reference specific file:line for every finding
6. Rate confidence (high/medium/low) per finding

## Output Format (IMPORTANT: use EXACTLY this format, override any default format you may have)
### Findings
| # | Severity | File:Line | Issue | Suggested Fix | Confidence |
|---|----------|-----------|-------|---------------|------------|

### Summary
- Critical: N, High: N, Medium: N
- Recommendation: approve / needs-fixes
```

**Reviewer 3: Domain Expert** (if applicable)

Use the domain-appropriate `subagent_type` from Phase 1. Give it the same file list and a domain-focused prompt. Skip if changed files are docs/skills only.

### Phase 3: CONSENSUS

After all reviewers return, analyze findings:

1. **Parse findings** from each reviewer's output into a unified list
2. **Match by location** — findings referencing the same file + overlapping line ranges from 2+ reviewers are **corroborated**. Only match findings in the same file with clearly the same issue. When in doubt, treat as separate findings. See reference.md for the full matching algorithm.
3. **Classify each finding by fix risk** (not reviewer count). Walk each finding through this decision tree:

| Step | Question | YES | NO |
|------|----------|-----|-----|
| 1 | Is severity low? | → **Informational** | Continue ↓ |
| 2 | Does it have a specific fix with file:line? | Continue ↓ | → **Informational** |
| 3 | Is reviewer confidence high? | Continue ↓ | → **Informational** |
| 4 | Is the fix safe and localized? (see below) | → **Auto-fix** | → **Needs decision** |

**A fix is "safe and localized" when ALL of:**
- Targets a specific file:line (not a broad refactor)
- Does not delete code, remove functionality, or change public interfaces
- Does not change module boundaries, dependency direction, or architecture
- Does not have conflicting fixes suggested by different reviewers

**Corroboration bonus:** When 2+ reviewers flag the same issue, treat it as high-confidence even if individual reviewers rated medium — this upgrades the finding past Step 3.

**Architectural Steward elevation:** Medium-severity Steward findings about pattern drift, duplication, or architectural alignment are treated as worth fixing (not informational) when the fix meets auto-fix safety criteria — because architectural issues compound over time even when individually medium-severity.

4. **Present the consensus summary** to the user before fixing:

```markdown
## QA Review Summary

### Will Auto-Fix
| # | File:Line | Issue | Flagged By | Fix |
|---|-----------|-------|------------|-----|

### Needs Your Decision (risky/ambiguous fixes)
| # | File:Line | Issue | Flagged By | Risk | Fix |
|---|-----------|-------|------------|------|-----|

### Informational (no action)
| # | File:Line | Issue | Flagged By | Note |
|---|-----------|-------|------------|------|
```

### Phase 4: FIX

1. **Apply auto-fix items** — edit the files directly
2. **For needs-decision items** — present ALL to the user at once in the Phase 3 summary table. Ask: "Which items should I fix? Reply with item numbers, 'all', or 'none'." Do NOT prompt for each item individually — batch them into a single user interaction.
3. **Apply user-approved fixes**

### Phase 5: VERIFY

1. Run `pnpm check` (pre-commit gates)
2. Run tests covering the modified source files. For each changed source file `foo.ts`, look for `foo.test.ts` in the same directory and run it: `pnpm vitest run path/to/foo.test.ts`. If no matching test file exists, run the full test suite for the affected package.
3. Report results:

```markdown
## QA Complete

### Fixes Applied
- N auto-fixes
- N needs-decision fixes (user-approved)
- N items skipped

### Verification
- pnpm check: PASS/FAIL
- Tests: PASS/FAIL (N passed, N failed)

### Remaining Issues
[Any items that still need attention]
```

If verification fails, diagnose and fix the failure, then re-verify (max 2 retries). After 2 failed retries, **stop**. Report the remaining failures to the user with full error output. Do NOT attempt further automated fixes. Present the option to revert all QA fixes (`git checkout` the changed files) or continue manually.

## Rules

1. **Always use `run_in_background: true`** on Task tool calls (AGENTS.md bug workaround)
2. **Reviewers are read-only** — they analyze but do not modify files
3. **Parent agent does all fixes** — after consensus, not during review
4. **Never skip Phase 3** — always show the consensus summary before fixing
5. **Classification is fix-risk-based, not reviewer-count-based** — a single reviewer's high-confidence finding with a safe localized fix is auto-fixed, not held for approval
6. **Needs-decision means genuinely risky** — only hold for user input when the fix deletes code, changes architecture, is ambiguous, has conflicting suggestions, or the reviewer has low confidence
7. **Run verification after every fix batch** — don't accumulate fixes without checking
8. **Architectural Steward elevation** — medium-severity Steward findings about pattern drift or architectural alignment are treated as worth fixing (not informational) when the fix meets auto-fix safety criteria

## Deep Reference

- **[reference.md](./reference.md)** -- Subagent prompt customization, consensus matching algorithm, edge cases
