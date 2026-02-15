---
name: qa
description: "Post-implementation review and fix. Spawns adversarial-reviewer + engineering-standards + domain expert in parallel, auto-fixes unanimous findings, presents disagreements to user."
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
Phase 2: REVIEW (3 parallel subagents)
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

3. **Determine domain** for the 3rd reviewer using this logic:
   | Changed files contain | Select |
   |----------------------|--------|
   | `apps/web/**` only | `frontend-expert` |
   | `apps/session-server/**` or `apps/daemon/**` | `backend-expert` |
   | `packages/**` only | `backend-expert` |
   | Both frontend and backend paths | `fullstack-expert` |
   | `.tsx` with layout/style changes | `design-expert` |
   | `.claude/skills/**` or docs only | Skip 3rd reviewer (use 2 only) |

4. **Build the file list** as absolute paths for subagent prompts.

### Phase 2: REVIEW

Spawn reviewers in parallel using the Task tool. **All subagents use `run_in_background: true`** per AGENTS.md bug workaround.

Use `Read` on each agent's `output_file` to retrieve results.

**Reviewer 1: Adversarial Reviewer**

```
subagent_type: "adversarial-reviewer"
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

## Output Format
### Findings
| # | Severity | File:Line | Issue | Suggested Fix | Confidence |
|---|----------|-----------|-------|---------------|------------|

### Summary
- Critical: N, High: N, Medium: N
- Recommendation: approve / needs-fixes
```

**Reviewer 2: Engineering Standards**

```
subagent_type: "engineering-standards"
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

## Output Format
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
2. **Match by location** — findings referencing the same file:line (or overlapping ranges) from 2+ reviewers are **unanimous**
3. **Categorize:**

| Category | Condition | Action |
|----------|-----------|--------|
| **Unanimous** | 2+ reviewers flag same file:line or same issue | Auto-fix |
| **Contested** | Only 1 reviewer flags, or reviewers disagree on fix | Ask user |
| **Informational** | Low severity + low confidence from 1 reviewer | Report but skip |

4. **Present the consensus summary** to the user before fixing:

```markdown
## QA Review Summary

### Will Auto-Fix (unanimous)
| # | File:Line | Issue | Flagged By | Fix |
|---|-----------|-------|------------|-----|

### Needs Your Decision (contested)
| # | File:Line | Issue | Flagged By | Views |
|---|-----------|-------|------------|-------|

### Informational (no action)
| # | File:Line | Issue | Flagged By | Note |
|---|-----------|-------|------------|------|
```

### Phase 4: FIX

1. **Apply unanimous fixes** — edit the files directly
2. **For contested items** — use AskUserQuestion with each contested finding, presenting the different reviewer perspectives. Options: "Fix it", "Skip it", or user provides custom resolution
3. **Apply user-approved contested fixes**

### Phase 5: VERIFY

1. Run `pnpm check` (pre-commit gates)
2. Run tests on changed files: `pnpm vitest run [changed-test-files]`
3. Report results:

```markdown
## QA Complete

### Fixes Applied
- N unanimous fixes
- N contested fixes (user-approved)
- N items skipped

### Verification
- pnpm check: PASS/FAIL
- Tests: PASS/FAIL (N passed, N failed)

### Remaining Issues
[Any items that still need attention]
```

If verification fails, diagnose and fix the failure, then re-verify (max 2 retries).

## Rules

1. **Always use `run_in_background: true`** on Task tool calls (AGENTS.md bug workaround)
2. **Reviewers are read-only** — they analyze but do not modify files
3. **Parent agent does all fixes** — after consensus, not during review
4. **Never skip Phase 3** — always show the consensus summary before fixing
5. **Unanimous = 2+ reviewers** — a single reviewer's finding is contested by default
6. **High confidence + critical severity from any reviewer is blocking** — even if only 1 reviewer flags it, present it as contested (not informational)
7. **Run verification after every fix batch** — don't accumulate fixes without checking

## Deep Reference

- **[reference.md](./reference.md)** -- Subagent prompt customization, consensus matching algorithm, edge cases
