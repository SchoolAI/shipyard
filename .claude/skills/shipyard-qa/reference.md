# QA Skill — Full Reference

## Consensus Matching Algorithm

### Step 1: Normalize Findings

Each reviewer produces a findings table. Normalize each finding into:

```typescript
{
  file: string,          // relative path
  line: number,          // primary line number
  lineRange: [start, end], // affected range (default: [line, line])
  severity: 'critical' | 'high' | 'medium' | 'low',
  issue: string,         // short description
  fix: string,           // suggested fix
  confidence: 'high' | 'medium' | 'low',
  reviewer: string,      // which reviewer flagged it
}
```

### Step 2: Match Findings

Two findings from different reviewers match if:
1. **Exact match:** Same file + overlapping line ranges (primary matching rule)
2. **Same-file match:** Same file + clearly the same issue even if line numbers differ slightly (e.g., both flag "type assertion on line 42" vs "unsafe cast on line 42-45")

Do NOT attempt fuzzy semantic matching across different files or abstract issue categories. Keep matching simple and deterministic — if you're unsure whether two findings match, treat them as separate findings. It's better to present something as contested than to incorrectly auto-fix.

### Step 3: Classify

| Match Count | Severity | Confidence | Classification |
|-------------|----------|------------|---------------|
| 2+ reviewers | any | any | **Unanimous** — auto-fix |
| 1 reviewer | critical | high | **Contested** — ask user (blocking) |
| 1 reviewer | critical | medium/low | **Contested** — ask user |
| 1 reviewer | high | high | **Contested** — ask user |
| 1 reviewer | high | medium/low | **Informational** — report only |
| 1 reviewer | medium/low | any | **Informational** — report only |

### Step 4: Merge Fixes

When 2+ reviewers suggest different fixes for the same issue:
- Prefer the more specific fix (file:line reference over general advice)
- Prefer the fix from the domain-relevant reviewer (engineering-standards for style issues, adversarial-reviewer for logic issues)
- If genuinely conflicting approaches, escalate to contested

---

## Subagent Prompt Customization

### Adapting Prompts Per Domain

The SKILL.md templates are starting points. Customize based on what was implemented:

**CRDT / Loro changes — add to adversarial-reviewer:**
```
Additionally check:
- Loro Handle subscriptions stored and cleaned up on shutdown
- CRDT document size growth bounded
- Concurrent operations resolve correctly
- No race conditions in subscription callbacks
- Cross-document consistency maintained
```

**React / Frontend changes — add to domain expert:**
```
Additionally check:
- Component cleanup in useEffect returns
- Memo/callback dependency arrays correct
- No stale closures in event handlers
- Accessible: keyboard nav, aria labels, contrast
- HeroUI compound component patterns followed
```

**API / Route changes — add to engineering-standards:**
```
Additionally check:
- Zod schemas for all request/response bodies
- Route has companion .test.ts file
- Error responses use consistent format
- No leaked internal details in error messages
```

**WebSocket / Real-time changes — add to adversarial-reviewer:**
```
Additionally check:
- Connection lifecycle (auth on connect, cleanup on disconnect)
- Message validation (malformed messages can't crash server)
- Reconnection handling (state recovery after disconnect)
- Backpressure handling (what happens when client is slow?)
```

---

## Edge Cases

### No Changed Files

If `git diff` shows no changes (everything already committed and clean):
- Fall back to `git diff HEAD~1..HEAD --name-only` for the last commit
- If still empty, ask the user which files to review

### Only Docs/Config Changed

If changed files are exclusively `.md`, `.json`, `.yaml`, or `.claude/skills/**`:
- Skip the 3rd domain reviewer
- Adversarial reviewer focuses on: accuracy, completeness, internal consistency
- Engineering standards focuses on: file naming, allowlist compliance

### Too Many Changed Files (20+)

If more than 20 files changed:
- Group files by directory/module
- Focus reviewers on the highest fan-in files first
- Mention skipped low-risk files in the summary

### Reviewer Returns No Findings

If a reviewer finds nothing wrong, their silence does NOT override another reviewer's findings. Classify the other reviewer's findings normally using the severity/confidence table above — a critical+high-confidence finding from a single reviewer is still contested (blocking), regardless of how many other reviewers found nothing.

### Fix Breaks Another Gate

If applying a fix causes `pnpm check` to fail:
- Revert the specific fix
- Reclassify it as contested with note: "fix caused regression"
- Present to user with the regression details

---

## Integration with Other Skills

### After /qa Completes → Commit

The typical workflow is:
```
[implement feature]
/qa implemented the XYZ feature
[review + fix cycle]
gt modify -m "feat: add XYZ feature"
gt submit -smp --no-verify
```

### /qa + /council

For high-stakes changes, run both:
1. `/council` first for design-level review (is the approach right?)
2. `/qa` after for implementation review (is the execution right?)

### /qa + /review-pr

After pushing:
1. `/qa` catches issues locally before push
2. `/review-pr` triages external reviewer comments after push
